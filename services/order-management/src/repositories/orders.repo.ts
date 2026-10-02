import { pool, type Queryable } from '../db/pool.js';
import type { OrderStatus } from '../domain/statusMachine.js';
import type { Brand, Depot, DockType, ListOrdersQuery, ParkingConstraint, TempRequirement } from '../schemas/orders.schema.js';

export interface OrderRow {
  order_ref: string;
  outlet_id: string;
  brand: Brand;
  depot: Depot;
  order_date: string;
  original_order_date: string;
  requested_order_date: string | null;
  temp_requirement: TempRequirement;
  status: OrderStatus;
  order_units: number;
  order_weight_kg: number;
  order_volume_m3: number;
  window_open_time: string;
  window_close_time: string;
  placed_by: string | null;
  placed_by_username: string;
  placed_at: Date;
  confirmed_at: Date | null;
  cutoff_applied_at: Date | null;
  deferral_count: number;
  vehicle_id: string | null;
  trip_id: number | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderRecord extends OrderRow {
  idempotency_fingerprint: string | null;
}

const ORDER_COLUMNS = `
  o.order_ref, o.outlet_id, o.brand, o.depot, o.order_date, o.original_order_date, o.requested_order_date,
  o.temp_requirement, o.status, o.order_units, o.order_weight_kg, o.order_volume_m3,
  to_char(o.window_open_time, 'HH24:MI')  AS window_open_time,
  to_char(o.window_close_time, 'HH24:MI') AS window_close_time,
  o.placed_by, o.placed_by_username, o.placed_at, o.confirmed_at, o.cutoff_applied_at,
  o.deferral_count, o.vehicle_id, o.trip_id, o.idempotency_key, o.created_at, o.updated_at`;

export async function findOrderByRef(
  ref: string,
  opts: { forUpdate?: boolean } = {},
  db: Queryable = pool,
): Promise<OrderRecord | null> {
  const { rows } = await db.query<OrderRecord>(
    `SELECT ${ORDER_COLUMNS}, o.idempotency_fingerprint FROM orders o WHERE o.order_ref = $1${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [ref],
  );
  return rows[0] ?? null;
}

export async function findOrderByIdempotencyKey(key: string, db: Queryable = pool): Promise<OrderRecord | null> {
  const { rows } = await db.query<OrderRecord>(
    `SELECT ${ORDER_COLUMNS}, o.idempotency_fingerprint FROM orders o WHERE o.idempotency_key = $1`,
    [key],
  );
  return rows[0] ?? null;
}

/** Same predicate as uq_orders_outlet_date_temp, so a pre-check and the index never disagree. */
export async function findBlockingOrderRef(
  params: { outletId: string; orderDate: string; temp: TempRequirement; excludeRef?: string },
  db: Queryable = pool,
): Promise<string | null> {
  const { rows } = await db.query<{ order_ref: string }>(
    `SELECT order_ref FROM orders
      WHERE outlet_id = $1 AND order_date = $2 AND temp_requirement = $3
        AND status NOT IN ('cancelled','not_run') AND deferral_count = 0
        AND ($4::varchar IS NULL OR order_ref <> $4)
      LIMIT 1`,
    [params.outletId, params.orderDate, params.temp, params.excludeRef ?? null],
  );
  return rows[0]?.order_ref ?? null;
}

export interface NewOrder {
  order_ref: string;
  outlet_id: string;
  brand: Brand;
  depot: Depot;
  order_date: string;
  requested_order_date: string | null;
  temp_requirement: TempRequirement;
  window_open_time: string;
  window_close_time: string;
  placed_by: string | null;
  placed_by_username: string;
  placed_at: Date;
  idempotency_key: string | null;
  idempotency_fingerprint: string | null;
}

export async function insertDraftOrder(order: NewOrder, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO orders (
       order_ref, outlet_id, brand, depot, order_date, original_order_date, requested_order_date,
       temp_requirement, status, window_open_time, window_close_time,
       placed_by, placed_by_username, placed_at, idempotency_key, idempotency_fingerprint)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7, 'draft', $8, $9, $10, $11, $12, $13, $14)`,
    [
      order.order_ref, order.outlet_id, order.brand, order.depot, order.order_date, order.requested_order_date,
      order.temp_requirement, order.window_open_time, order.window_close_time, order.placed_by,
      order.placed_by_username, order.placed_at, order.idempotency_key, order.idempotency_fingerprint,
    ],
  );
}

export async function recomputeRollups(ref: string, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE orders o SET
       order_units     = COALESCE(t.units, 0),
       order_weight_kg = COALESCE(t.weight, 0),
       order_volume_m3 = COALESCE(t.volume, 0),
       updated_at      = now()
     FROM (
       SELECT SUM(quantity)                  AS units,
              SUM(quantity * unit_weight_kg) AS weight,
              SUM(quantity * unit_volume_m3) AS volume
       FROM order_items WHERE order_ref = $1
     ) t
     WHERE o.order_ref = $1`,
    [ref],
  );
}

export async function markConfirmed(
  ref: string,
  params: { orderDate: string; at: Date },
  db: Queryable,
): Promise<void> {
  await db.query(
    `UPDATE orders
        SET status = 'confirmed', order_date = $2, original_order_date = $2,
            confirmed_at = $3, cutoff_applied_at = $3, updated_at = now()
      WHERE order_ref = $1`,
    [ref, params.orderDate, params.at],
  );
}

export async function setStatus(
  ref: string,
  status: OrderStatus,
  db: Queryable,
  extra: { vehicleId?: string | null; tripId?: number | null } = {},
): Promise<void> {
  const setsAllocation = extra.vehicleId !== undefined || extra.tripId !== undefined;
  await db.query(
    `UPDATE orders
        SET status = $2,
            vehicle_id = CASE WHEN $3 THEN $4 ELSE vehicle_id END,
            trip_id    = CASE WHEN $3 THEN $5::smallint ELSE trip_id END,
            updated_at = now()
      WHERE order_ref = $1`,
    [ref, status, setsAllocation, extra.vehicleId ?? null, extra.tripId ?? null],
  );
}

export async function applyDeferral(ref: string, newOrderDate: string, db: Queryable): Promise<number> {
  const { rows } = await db.query<{ deferral_count: number }>(
    `UPDATE orders
        SET status = 'deferred', deferral_count = deferral_count + 1, order_date = $2,
            vehicle_id = NULL, trip_id = NULL, updated_at = now()
      WHERE order_ref = $1
      RETURNING deferral_count`,
    [ref, newOrderDate],
  );
  return rows[0].deferral_count;
}

export async function listOrders(
  filters: ListOrdersQuery,
  db: Queryable = pool,
): Promise<{ rows: OrderRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.outlet_id) add('o.outlet_id = ?', filters.outlet_id);
  if (filters.depot) add('o.depot = ?', filters.depot);
  if (filters.brand) add('o.brand = ?', filters.brand);
  if (filters.status?.length) add('o.status = ANY(?::varchar[])', filters.status);
  if (filters.temp_requirement) add('o.temp_requirement = ?', filters.temp_requirement);
  if (filters.from) add('o.order_date >= ?::date', filters.from);
  if (filters.to) add('o.order_date <= ?::date', filters.to);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);

  const offset = (filters.page - 1) * filters.page_size;
  // order_ref is the PK, so the sort is total and pages never overlap or skip rows.
  const { rows } = await db.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders o ${whereSql}
      ORDER BY o.order_date DESC, o.order_ref ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.page_size, offset],
  );
  return { rows, total: countResult.rows[0].total };
}

export interface ConfirmedOrderRow {
  order_ref: string;
  outlet_id: string;
  brand: Brand;
  depot: Depot;
  district: string;
  temp_requirement: TempRequirement;
  order_units: number;
  order_weight_kg: number;
  order_volume_m3: number;
  window_open_time: string;
  window_close_time: string;
  dock_type: DockType;
  parking_constraint: ParkingConstraint;
  mall_window: boolean;
  deferral_count: number;
  deferred_yesterday: boolean;
  days_since_last_served: number;
  original_order_date: string;
}

export async function findConfirmedForDate(
  params: { date: string; depot?: Depot },
  db: Queryable = pool,
): Promise<ConfirmedOrderRow[]> {
  // Most-deferred and longest-unserved first: the order Planning should consider them in.
  const { rows } = await db.query<ConfirmedOrderRow>(
    `SELECT o.order_ref, o.outlet_id, o.brand, o.depot, r.district, o.temp_requirement,
            o.order_units, o.order_weight_kg, o.order_volume_m3,
            to_char(o.window_open_time, 'HH24:MI')  AS window_open_time,
            to_char(o.window_close_time, 'HH24:MI') AS window_close_time,
            r.dock_type, r.parking_constraint, r.mall_window,
            o.deferral_count, r.deferred_yesterday, r.days_since_last_served, o.original_order_date
       FROM orders o
       JOIN outlets_ref r ON r.outlet_id = o.outlet_id
      WHERE o.order_date = $1 AND o.status = 'confirmed'
        AND ($2::varchar IS NULL OR o.depot = $2)
      ORDER BY o.deferral_count DESC, r.days_since_last_served DESC, o.window_open_time, o.order_ref`,
    [params.date, params.depot ?? null],
  );
  return rows;
}

export interface SummaryRow {
  status: OrderStatus;
  brand: Brand;
  temp_requirement: TempRequirement;
  orders: number;
  units: number;
  weight_kg: number;
  volume_m3: number;
}

export async function summarise(params: { date: string; depot?: Depot }, db: Queryable = pool): Promise<SummaryRow[]> {
  const { rows } = await db.query<SummaryRow>(
    `SELECT status, brand, temp_requirement,
            COUNT(*)::int                           AS orders,
            COALESCE(SUM(order_units), 0)::int      AS units,
            COALESCE(SUM(order_weight_kg), 0)       AS weight_kg,
            COALESCE(SUM(order_volume_m3), 0)       AS volume_m3
       FROM orders
      WHERE order_date = $1 AND ($2::varchar IS NULL OR depot = $2)
      GROUP BY status, brand, temp_requirement`,
    [params.date, params.depot ?? null],
  );
  return rows;
}

export async function sweepDeferredIntoPool(closingDate: string, db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ order_ref: string }>(
    `UPDATE orders SET status = 'confirmed', updated_at = now()
      WHERE status = 'deferred' AND order_date = $1
      RETURNING order_ref`,
    [closingDate],
  );
  return rows.map((r) => r.order_ref);
}
