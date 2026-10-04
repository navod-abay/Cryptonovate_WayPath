import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { env } from '../config/env.js';
import { pool, withTransaction, type Queryable } from '../db/pool.js';
import { addDays, colomboToday, isOperatingDay, nextOperatingDay, now } from '../domain/calendar.js';
import { earliestDeliveryDate, isDateOpen, nextRunDate, resolveConfirmDate } from '../domain/cutoff.js';
import { AppError, appError, isAppError, isUniqueViolation, mapPgError } from '../domain/errors.js';
import { nextOrderRef } from '../domain/orderRef.js';
import { assertDeferralReason, DEFERRAL_REASONS, type DeferralReasonCode } from '../domain/reasonCodes.js';
import {
  allowedTransitions,
  assertTransition,
  CANCELLABLE_STATUSES,
  type OrderStatus,
} from '../domain/statusMachine.js';
import { assertOutletInScope, type Actor } from '../middleware/outletScope.js';
import { getReeferCapacity, resolveOutlet } from './referenceData.js';
import { appendEvent, listEvents, listRecentEvents, type StatusEventRow } from '../repositories/events.repo.js';
import { countItems, insertItems, listItems, replaceItems, type OrderItemRow } from '../repositories/orderItems.repo.js';
import {
  applyDeferral,
  findBlockingOrderRef,
  findConfirmedForDate,
  findOrderByIdempotencyKey,
  findOrderByRef,
  insertDraftOrder,
  listOrders as listOrdersRepo,
  markConfirmed,
  recomputeRollups,
  setStatus,
  summarise,
  type OrderRecord,
  type OrderRow,
} from '../repositories/orders.repo.js';
import { findAtRiskOutlets, outletDirectory } from '../repositories/outlets.repo.js';
import type {
  CreateOrderInput,
  Depot,
  ListOrdersQuery,
  OrderItemInput,
  ReceiptInput,
  StatusChangeInput,
  StatusUpdateInput,
  TempRequirement,
} from '../schemas/orders.schema.js';

const SYSTEM_ROLE = 'system';
const RECENT_EVENTS_LIMIT = 20;
const AT_RISK_LOOKBACK_DAYS = 14;
const UNIQUE_TRIPLE_INDEX = 'uq_orders_outlet_date_temp';
const IDEMPOTENCY_INDEX = 'uq_orders_idempotency';
const RECEIPT_UNIQUE = 'order_receipts_order_ref_key';

// Statuses the status-batch endpoint may never set: they belong to create, receipt, or the system.
const NON_BATCH_TARGETS: Readonly<Partial<Record<OrderStatus, string>>> = {
  draft: 'orders are only created as draft',
  received: "'received' is set only by POST /:order_ref/receipt",
  disputed: "'disputed' is set only by POST /:order_ref/receipt",
  not_run: "'not_run' is set only by the system after MAX_DEFERRALS",
};

// ------------------------------------------------------------------ DTOs

export type OrderDto = OrderRow;

export interface OrderDetailDto extends OrderDto {
  items: OrderItemRow[];
  events: StatusEventRow[];
}

function toDto(order: OrderRecord | OrderRow): OrderDto {
  const { idempotency_fingerprint: _omit, ...rest } = order as OrderRecord;
  return rest;
}

async function loadDetail(ref: string, db: Queryable = pool): Promise<OrderDetailDto> {
  const order = await findOrderByRef(ref, {}, db);
  if (!order) throw orderNotFound(ref);
  const [items, events] = await Promise.all([listItems(ref, db), listRecentEvents(ref, RECENT_EVENTS_LIMIT, db)]);
  return { ...toDto(order), items, events };
}

// ------------------------------------------------------------------ helpers

function orderNotFound(ref: string): AppError {
  return appError('ORDER_NOT_FOUND', `Order ${ref} does not exist`, { order_ref: ref });
}

async function lockOrder(ref: string, db: Queryable): Promise<OrderRecord> {
  const order = await findOrderByRef(ref, { forUpdate: true }, db);
  if (!order) throw orderNotFound(ref);
  return order;
}

async function lockOrderInScope(actor: Actor, ref: string, db: Queryable): Promise<OrderRecord> {
  const order = await lockOrder(ref, db);
  assertOutletInScope(actor, order.outlet_id);
  return order;
}

function assertItemsMatchTemperature(items: readonly OrderItemInput[], temp: TempRequirement): void {
  const mismatched = items
    .map((item, index) => ({ index, sku: item.sku, is_chilled: item.is_chilled }))
    .filter((i) => i.is_chilled !== (temp === 'chilled'));
  if (mismatched.length > 0) {
    throw appError(
      'CHILLED_MISMATCH',
      `Every item on a${temp === 'ambient' ? 'n' : ''} ${temp} order must have is_chilled=${temp === 'chilled'}. ` +
        'Place chilled and ambient goods on separate orders.',
      { temp_requirement: temp, mismatched_items: mismatched },
    );
  }
}

async function duplicateOrderError(
  params: { outletId: string; orderDate: string; temp: TempRequirement; excludeRef?: string },
): Promise<AppError> {
  const existing = await findBlockingOrderRef(params);
  return appError(
    'DUPLICATE_ORDER',
    `Outlet ${params.outletId} already has an active ${params.temp} order for ${params.orderDate}`,
    { existing_order_ref: existing, outlet_id: params.outletId, order_date: params.orderDate, temp_requirement: params.temp },
  );
}

function fingerprint(input: CreateOrderInput): string {
  const canonical = {
    outlet_id: input.outlet_id,
    temp_requirement: input.temp_requirement,
    order_date: input.order_date ?? null,
    items: [...input.items]
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((i) => [i.sku, i.description, i.quantity, i.unit_weight_kg, i.unit_volume_m3, i.is_chilled]),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

async function resolveIdempotentReplay(key: string, fp: string): Promise<OrderDetailDto | null> {
  const existing = await findOrderByIdempotencyKey(key);
  if (!existing) return null;
  if (existing.idempotency_fingerprint !== fp) {
    throw appError('IDEMPOTENCY_KEY_CONFLICT', 'This Idempotency-Key was already used with a different request body', {
      idempotency_key: key,
      order_ref: existing.order_ref,
    });
  }
  return loadDetail(existing.order_ref);
}

// ------------------------------------------------------------------ create / edit / confirm / cancel

export interface CreateResult {
  order: OrderDetailDto;
  replayed: boolean;
}

export async function createOrder(actor: Actor, input: CreateOrderInput, idempotencyKey: string | null): Promise<CreateResult> {
  const fp = idempotencyKey ? fingerprint(input) : null;
  if (idempotencyKey && fp) {
    const replay = await resolveIdempotentReplay(idempotencyKey, fp);
    if (replay) {
      // A replay must not leak another outlet's order to a store manager.
      assertOutletInScope(actor, replay.outlet_id);
      return { order: replay, replayed: true };
    }
  }

  assertOutletInScope(actor, input.outlet_id);
  const outlet = await resolveOutlet(input.outlet_id);
  if (!outlet) {
    throw appError('OUTLET_NOT_FOUND', `Outlet ${input.outlet_id} does not exist`, { outlet_id: input.outlet_id });
  }

  if (input.temp_requirement === 'chilled' && outlet.brand !== 'Fresh') {
    throw appError('CHILLED_MISMATCH', `Only Fresh outlets place chilled orders; ${outlet.outlet_id} is ${outlet.brand}`, {
      outlet_id: outlet.outlet_id,
      brand: outlet.brand,
    });
  }
  assertItemsMatchTemperature(input.items, input.temp_requirement);

  if (input.order_date) {
    if (!isOperatingDay(input.order_date)) {
      throw appError('NON_OPERATING_DATE', `${input.order_date} is not an operating day`, {
        order_date: input.order_date,
        next_operating_day: nextOperatingDay(input.order_date),
      });
    }
    if (!isDateOpen(input.order_date)) {
      throw appError('CUTOFF_PASSED', `Ordering for ${input.order_date} has closed`, {
        requested_date: input.order_date,
        next_available_date: earliestDeliveryDate(),
      });
    }
  }

  // Without an explicit date the draft holds the earliest open run provisionally;
  // the real date is fixed at confirm time.
  const orderDate = input.order_date ?? earliestDeliveryDate();
  const triple = { outletId: outlet.outlet_id, orderDate, temp: input.temp_requirement };

  try {
    const ref = await withTransaction(async (client) => {
      if (await findBlockingOrderRef(triple, client)) {
        throw await duplicateOrderError(triple);
      }
      const orderRef = await nextOrderRef(client, orderDate);
      await insertDraftOrder(
        {
          order_ref: orderRef,
          outlet_id: outlet.outlet_id,
          brand: outlet.brand,
          depot: outlet.depot,
          order_date: orderDate,
          requested_order_date: input.order_date ?? null,
          temp_requirement: input.temp_requirement,
          window_open_time: outlet.window_open_time,
          window_close_time: outlet.window_close_time,
          placed_by: actor.id,
          placed_by_username: actor.username,
          placed_at: now(),
          idempotency_key: idempotencyKey,
          idempotency_fingerprint: fp,
        },
        client,
      );
      await insertItems(orderRef, input.items, client);
      await recomputeRollups(orderRef, client);
      await appendEvent({ orderRef, from: null, to: 'draft', actorId: actor.id, actorRole: actor.role }, client);
      return orderRef;
    });
    return { order: await loadDetail(ref), replayed: false };
  } catch (err) {
    if (isUniqueViolation(err, UNIQUE_TRIPLE_INDEX)) throw await duplicateOrderError(triple);
    if (idempotencyKey && fp && isUniqueViolation(err, IDEMPOTENCY_INDEX)) {
      // Lost a race with a concurrent request carrying the same key.
      const replay = await resolveIdempotentReplay(idempotencyKey, fp);
      if (replay) return { order: replay, replayed: true };
    }
    throw err;
  }
}

export async function replaceOrderItems(actor: Actor, ref: string, items: OrderItemInput[]): Promise<OrderDetailDto> {
  await withTransaction(async (client) => {
    const order = await lockOrderInScope(actor, ref, client);
    const editable = order.status === 'draft' || (order.status === 'confirmed' && isDateOpen(order.order_date));
    if (!editable) {
      throw appError(
        'ORDER_NOT_EDITABLE',
        order.status === 'confirmed'
          ? `Ordering for ${order.order_date} has closed; items can no longer be changed`
          : `Items cannot be changed once an order is '${order.status}'`,
        { order_ref: ref, status: order.status, order_date: order.order_date },
      );
    }
    if (order.status === 'confirmed' && items.length === 0) {
      throw appError('EMPTY_ORDER', 'A confirmed order must keep at least one item; cancel it instead', { order_ref: ref });
    }
    assertItemsMatchTemperature(items, order.temp_requirement);
    await replaceItems(ref, items, client);
    await recomputeRollups(ref, client);
  });
  return loadDetail(ref);
}

export interface ConfirmResult {
  order: OrderDetailDto;
  rolledToNextRun: boolean;
}

export async function confirmOrder(actor: Actor, ref: string, acceptNextRun: boolean): Promise<ConfirmResult> {
  const ctx: { triple?: { outletId: string; orderDate: string; temp: TempRequirement; excludeRef: string } } = {};
  try {
    const rolledToNextRun = await withTransaction(async (client) => {
      const order = await lockOrderInScope(actor, ref, client);
      if (order.status !== 'draft') {
        throw appError('INVALID_STATE_TRANSITION', `Only draft orders can be confirmed; ${ref} is '${order.status}'`, {
          from: order.status,
          to: 'confirmed',
          allowed: [...allowedTransitions(order.status)],
        });
      }
      if ((await countItems(ref, client)) === 0) {
        throw appError('EMPTY_ORDER', 'Add at least one item before confirming', { order_ref: ref });
      }

      const at = now();
      const resolution = resolveConfirmDate({ requestedDate: order.requested_order_date, acceptNextRun, at });
      if (!isOperatingDay(resolution.orderDate)) {
        throw appError('NON_OPERATING_DATE', `${resolution.orderDate} is no longer an operating day`, {
          order_date: resolution.orderDate,
          next_operating_day: nextOperatingDay(resolution.orderDate),
        });
      }

      const triple = { outletId: order.outlet_id, orderDate: resolution.orderDate, temp: order.temp_requirement, excludeRef: ref };
      ctx.triple = triple;
      if (await findBlockingOrderRef(triple, client)) {
        throw await duplicateOrderError(triple);
      }

      await markConfirmed(ref, { orderDate: resolution.orderDate, at }, client);
      await appendEvent(
        {
          orderRef: ref,
          from: 'draft',
          to: 'confirmed',
          reasonNote: resolution.rolledToNextRun
            ? `Cutoff passed; rolled to next run ${resolution.orderDate} (accept_next_run)`
            : null,
          actorId: actor.id,
          actorRole: actor.role,
        },
        client,
      );
      return resolution.rolledToNextRun;
    });
    return { order: await loadDetail(ref), rolledToNextRun };
  } catch (err) {
    if (ctx.triple && isUniqueViolation(err, UNIQUE_TRIPLE_INDEX)) throw await duplicateOrderError(ctx.triple);
    throw err;
  }
}

export async function cancelOrder(actor: Actor, ref: string, reasonNote: string | undefined): Promise<OrderDetailDto> {
  await withTransaction(async (client) => {
    const order = await lockOrderInScope(actor, ref, client);
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw appError(
        'ORDER_NOT_CANCELLABLE',
        `Order ${ref} is '${order.status}' and can no longer be cancelled here; after allocation cancellation is a Planning decision`,
        { order_ref: ref, status: order.status, cancellable_from: CANCELLABLE_STATUSES },
      );
    }
    await setStatus(ref, 'cancelled', client);
    await appendEvent(
      { orderRef: ref, from: order.status, to: 'cancelled', reasonNote: reasonNote || null, actorId: actor.id, actorRole: actor.role },
      client,
    );
  });
  return loadDetail(ref);
}

// ------------------------------------------------------------------ reads

export async function getOrder(actor: Actor, ref: string): Promise<OrderDetailDto> {
  const detail = await loadDetail(ref);
  assertOutletInScope(actor, detail.outlet_id);
  return detail;
}

export async function listOrders(actor: Actor, query: ListOrdersQuery) {
  let filters = query;
  if (actor.role === 'store_manager') {
    if (query.outlet_id) assertOutletInScope(actor, query.outlet_id);
    if (!actor.outletId) assertOutletInScope(actor, '');
    filters = { ...query, outlet_id: actor.outletId ?? undefined };
  }
  const { rows, total } = await listOrdersRepo(filters);
  return { orders: rows.map(toDto), page: filters.page, page_size: filters.page_size, total };
}

export async function getOrderHistory(actor: Actor, ref: string) {
  const order = await findOrderByRef(ref);
  if (!order) throw orderNotFound(ref);
  assertOutletInScope(actor, order.outlet_id);
  const events = await listEvents(ref);
  return {
    order_ref: order.order_ref,
    outlet_id: order.outlet_id,
    status: order.status,
    order_date: order.order_date,
    original_order_date: order.original_order_date,
    deferral_count: order.deferral_count,
    events: events.map((e) => ({
      from_status: e.from_status,
      to_status: e.to_status,
      reason_code: e.reason_code,
      reason_label: e.reason_code ? DEFERRAL_REASONS[e.reason_code as DeferralReasonCode] ?? null : null,
      reason_note: e.reason_note,
      actor_id: e.actor_id,
      actor_role: e.actor_role,
      occurred_at: e.occurred_at,
    })),
  };
}

export async function getConfirmedForPlanning(date: string, depot: Depot | undefined) {
  const rows = await findConfirmedForDate({ date, depot });
  const round = (n: number, dp: number) => Number(n.toFixed(dp));
  const chilled = rows.filter((r) => r.temp_requirement === 'chilled');
  return {
    date,
    depot: depot ?? null,
    totals: {
      orders: rows.length,
      units: rows.reduce((s, r) => s + r.order_units, 0),
      weight_kg: round(rows.reduce((s, r) => s + r.order_weight_kg, 0), 2),
      volume_m3: round(rows.reduce((s, r) => s + r.order_volume_m3, 0), 3),
      chilled_orders: chilled.length,
      chilled_volume_m3: round(chilled.reduce((s, r) => s + r.order_volume_m3, 0), 3),
    },
    orders: rows,
  };
}

export async function getSummary(date: string | undefined, depot: Depot | undefined) {
  const day = date ?? nextRunDate();
  const rows = await summarise({ date: day, depot });
  const round = (n: number, dp: number) => Number(n.toFixed(dp));
  const INACTIVE: OrderStatus[] = ['cancelled', 'not_run'];

  const byStatus: Record<string, number> = {};
  const byBrand: Record<string, { orders: number; units: number; weight_kg: number; volume_m3: number }> = {};
  const byTemp = {
    ambient: { orders: 0, units: 0, weight_kg: 0, volume_m3: 0 },
    chilled: { orders: 0, units: 0, weight_kg: 0, volume_m3: 0 },
  };

  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + r.orders;
    if (INACTIVE.includes(r.status)) continue;
    const b = (byBrand[r.brand] ??= { orders: 0, units: 0, weight_kg: 0, volume_m3: 0 });
    const t = byTemp[r.temp_requirement];
    for (const bucket of [b, t]) {
      bucket.orders += r.orders;
      bucket.units += r.units;
      bucket.weight_kg += r.weight_kg;
      bucket.volume_m3 += r.volume_m3;
    }
  }
  for (const bucket of [...Object.values(byBrand), byTemp.ambient, byTemp.chilled]) {
    bucket.weight_kg = round(bucket.weight_kg, 2);
    bucket.volume_m3 = round(bucket.volume_m3, 3);
  }

  const reefers = await getReeferCapacity(depot);
  const demand = byTemp.chilled.volume_m3;
  const chilledCapacity = reefers.available ? reefers.volume_m3 * env.CHILLED_TRIPS_PER_DAY : null;
  return {
    date: day,
    depot: depot ?? null,
    by_status: byStatus,
    by_brand: byBrand,
    by_temperature: byTemp,
    chilled_capacity_reference: {
      // Vehicles come from Fleet & Directory's API. When it cannot be reached the figures are
      // null rather than guessed.
      available: reefers.available,
      note: reefers.available
        ? 'Volume of the available refrigerated vehicles, from Fleet & Directory'
        : `Capacity unavailable: ${reefers.reason}`,
      reefer_vehicles: reefers.available ? reefers.vehicles : null,
      reefer_volume_m3: reefers.available ? reefers.volume_m3 : null,
      chilled_trips_per_day: env.CHILLED_TRIPS_PER_DAY,
      capacity_m3: chilledCapacity === null ? null : round(chilledCapacity, 3),
      demand_m3: demand,
      utilisation_pct: chilledCapacity ? round((demand / chilledCapacity) * 100, 1) : null,
      exceeds_capacity: chilledCapacity === null ? null : demand > chilledCapacity,
    },
  };
}

export async function getAtRisk(params: { depot?: Depot; minDeferrals: number; minDays: number }) {
  const today = colomboToday();
  const rows = await findAtRiskOutlets({ ...params, today, lookbackFrom: addDays(today, -AT_RISK_LOOKBACK_DAYS) });
  return {
    criteria: { min_deferrals: params.minDeferrals, min_days: params.minDays, depot: params.depot ?? null },
    outlets: rows.map((r) => {
      const flags: string[] = [];
      if (r.deferred_yesterday || r.max_deferral_count >= params.minDeferrals) flags.push('CONSECUTIVE_DEFERRAL_RISK');
      if (r.days_since_last_served >= params.minDays && r.overdue_open_orders > 0) flags.push('STALE_SERVICE');
      if (r.aged_out_orders > 0) flags.push('AGED_OUT_RECENTLY');
      return { ...r, flags };
    }),
  };
}

// ------------------------------------------------------------------ status changes (Planning write-back)

async function deferLocked(
  client: PoolClient,
  actor: Actor,
  order: OrderRecord,
  reasonCode: unknown,
  reasonNote: unknown,
): Promise<void> {
  assertTransition(order.status, 'deferred');
  const reason = assertDeferralReason(reasonCode, reasonNote);
  const ref = order.order_ref;
  const newDate = nextOperatingDay(order.order_date);

  const count = await applyDeferral(ref, newDate, client);
  await appendEvent(
    {
      orderRef: ref,
      from: 'confirmed',
      to: 'deferred',
      reasonCode: reason.reasonCode,
      reasonNote: reason.reasonNote,
      actorId: actor.id,
      actorRole: actor.role,
    },
    client,
  );
  await outletDirectory.markDeferred(order.outlet_id, client);

  if (count >= env.MAX_DEFERRALS) {
    await setStatus(ref, 'not_run', client);
    await appendEvent(
      {
        orderRef: ref,
        from: 'deferred',
        to: 'not_run',
        reasonCode: 'AGED_OUT',
        reasonNote: `Deferred ${count} times (MAX_DEFERRALS=${env.MAX_DEFERRALS}); originally due ${order.original_order_date}`,
        actorRole: SYSTEM_ROLE,
      },
      client,
    );
  } else {
    await setStatus(ref, 'confirmed', client);
    await appendEvent(
      {
        orderRef: ref,
        from: 'deferred',
        to: 'confirmed',
        reasonNote: `Returned to the confirmed pool for ${newDate} (deferral ${count} of ${env.MAX_DEFERRALS})`,
        actorRole: SYSTEM_ROLE,
      },
      client,
    );
  }
}

async function applyStatusUpdateLocked(client: PoolClient, actor: Actor, update: StatusUpdateInput): Promise<void> {
  const order = await lockOrder(update.order_ref, client);
  const target = update.status;

  const forbidden = NON_BATCH_TARGETS[target];
  if (forbidden) {
    throw appError('INVALID_STATE_TRANSITION', `Cannot set '${target}' here: ${forbidden}`, {
      from: order.status,
      to: target,
      allowed: allowedTransitions(order.status).filter((s) => !NON_BATCH_TARGETS[s]),
    });
  }

  if (target === 'deferred') {
    await deferLocked(client, actor, order, update.reason_code, update.reason_note);
    return;
  }

  assertTransition(order.status, target);

  if (target === 'allocated') {
    const problems: { field: string; message: string }[] = [];
    if (!update.vehicle_id) problems.push({ field: 'vehicle_id', message: 'vehicle_id is required for allocated' });
    if (update.trip_id !== 1 && update.trip_id !== 2) problems.push({ field: 'trip_id', message: 'trip_id must be 1 or 2' });
    if (problems.length > 0) {
      throw appError('VALIDATION_ERROR', 'Allocation requires vehicle_id and trip_id ∈ {1,2}', problems);
    }
    await setStatus(order.order_ref, 'allocated', client, { vehicleId: update.vehicle_id, tripId: update.trip_id });
  } else {
    await setStatus(order.order_ref, target, client);
  }

  await appendEvent(
    {
      orderRef: order.order_ref,
      from: order.status,
      to: target,
      reasonCode: update.reason_code || null,
      reasonNote:
        update.reason_note ||
        (target === 'allocated' ? `Allocated to ${update.vehicle_id}, trip ${update.trip_id}` : null),
      actorId: actor.id,
      actorRole: actor.role,
    },
    client,
  );
}

export interface BatchFailure {
  index: number;
  order_ref: string;
  code: string;
  message: string;
  details?: unknown;
}

/** All-or-nothing: every entry is attempted so the caller sees every failure, then the whole batch rolls back. */
export async function applyStatusBatch(actor: Actor, updates: StatusUpdateInput[]) {
  const refs = await withTransaction(async (client) => {
    const failures: BatchFailure[] = [];
    for (const [index, update] of updates.entries()) {
      await client.query('SAVEPOINT batch_entry');
      try {
        await applyStatusUpdateLocked(client, actor, update);
        await client.query('RELEASE SAVEPOINT batch_entry');
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT batch_entry');
        const appErr = isAppError(err) ? err : mapPgError(err);
        if (!appErr || appErr.code === 'DB_UNAVAILABLE') throw err;
        failures.push({
          index,
          order_ref: update.order_ref,
          code: appErr.code,
          message: appErr.message,
          ...(appErr.details !== undefined ? { details: appErr.details } : {}),
        });
      }
    }
    if (failures.length > 0) {
      throw new AppError(
        failures[0].code as AppError['code'],
        422,
        `${failures.length} of ${updates.length} update(s) rejected; no changes were applied`,
        { failures },
      );
    }
    return [...new Set(updates.map((u) => u.order_ref))];
  });

  const orders = await Promise.all(
    refs.map(async (ref) => {
      const order = await findOrderByRef(ref);
      return order ? toDto(order) : null;
    }),
  );
  return { updated: updates.length, orders: orders.filter((o): o is OrderDto => o !== null) };
}

// Field roles may only report the steps they physically perform; dispatchers may set any
// status the batch endpoint allows.
const STATUS_BY_ROLE: Readonly<Partial<Record<Actor['role'], readonly OrderStatus[]>>> = {
  loader: ['loaded'],
  driver: ['out_for_delivery', 'delivered'],
};

/** Single-order status change (Execution & Sync). Same rules and code path as one status-batch entry. */
export async function changeOrderStatus(actor: Actor, ref: string, change: StatusChangeInput): Promise<OrderDetailDto> {
  if (actor.role !== 'dispatcher') {
    const permitted = STATUS_BY_ROLE[actor.role] ?? [];
    if (!permitted.includes(change.status)) {
      throw appError('FORBIDDEN', `Role '${actor.role}' may not set status '${change.status}'`, {
        role: actor.role,
        status: change.status,
        permitted,
      });
    }
  }
  await withTransaction((client) => applyStatusUpdateLocked(client, actor, { ...change, order_ref: ref }));
  return loadDetail(ref);
}

export async function deferOrder(actor: Actor, ref: string, reasonCode: unknown, reasonNote: unknown): Promise<OrderDetailDto> {
  await withTransaction(async (client) => {
    const order = await lockOrder(ref, client);
    await deferLocked(client, actor, order, reasonCode, reasonNote);
  });
  return loadDetail(ref);
}

// ------------------------------------------------------------------ receipt

interface ReceiptRow {
  id: string;
  order_ref: string;
  received_units: number;
  missing_units: number;
  rejected_units: number;
  note: string | null;
  received_by: string | null;
  received_at: Date;
}

export async function recordReceipt(actor: Actor, ref: string, input: ReceiptInput) {
  try {
    await withTransaction(async (client) => {
      const order = await lockOrderInScope(actor, ref, client);
      const { rows: existing } = await client.query('SELECT 1 FROM order_receipts WHERE order_ref = $1', [ref]);
      if (existing.length > 0) {
        throw appError('RECEIPT_ALREADY_RECORDED', `A receipt has already been recorded for ${ref}`, { order_ref: ref });
      }
      if (order.status !== 'delivered') {
        throw appError('INVALID_STATE_TRANSITION', `A receipt can only be recorded for a delivered order; ${ref} is '${order.status}'`, {
          from: order.status,
          to: 'received',
          allowed: [...allowedTransitions(order.status)],
        });
      }

      const accounted = input.received_units + input.missing_units + input.rejected_units;
      if (accounted !== order.order_units) {
        throw appError(
          'RECEIPT_UNITS_MISMATCH',
          `received + missing + rejected (${accounted}) must equal the ordered units (${order.order_units})`,
          {
            order_units: order.order_units,
            received_units: input.received_units,
            missing_units: input.missing_units,
            rejected_units: input.rejected_units,
          },
        );
      }

      const target: OrderStatus = input.missing_units + input.rejected_units === 0 ? 'received' : 'disputed';
      assertTransition(order.status, target);

      await client.query(
        `INSERT INTO order_receipts (order_ref, received_units, missing_units, rejected_units, note, received_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ref, input.received_units, input.missing_units, input.rejected_units, input.note || null, actor.id],
      );
      await setStatus(ref, target, client);
      await appendEvent(
        {
          orderRef: ref,
          from: order.status,
          to: target,
          reasonNote:
            input.note ||
            (target === 'disputed' ? `${input.missing_units} missing, ${input.rejected_units} rejected` : null),
          actorId: actor.id,
          actorRole: actor.role,
        },
        client,
      );
      // A short delivery is still a visit: the outlet was served, so fairness counters reset either way.
      await outletDirectory.markServed(order.outlet_id, order.order_date, client);
    });
  } catch (err) {
    if (isUniqueViolation(err, RECEIPT_UNIQUE)) {
      throw appError('RECEIPT_ALREADY_RECORDED', `A receipt has already been recorded for ${ref}`, { order_ref: ref });
    }
    throw err;
  }

  const [order, receipt] = await Promise.all([
    loadDetail(ref),
    pool
      .query<ReceiptRow>(
        `SELECT id, order_ref, received_units, missing_units, rejected_units, note, received_by, received_at
           FROM order_receipts WHERE order_ref = $1`,
        [ref],
      )
      .then((r) => r.rows[0]),
  ]);
  return { order, receipt };
}
