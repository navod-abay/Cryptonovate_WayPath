import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { AccessTokenPayload } from '../middleware/auth';
import { ShortfallInput } from '../schemas/execution.schema';
import { enqueueAlert, relayPendingAlerts } from './alertOutbox';
import { ExecutionSyncService, HttpError, PlannedTrip } from './sync.service';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-management:5002';

/**
 * Scan-to-load. Every unit of every order line carries its own label, <orderRef>|<sku>|<unit>
 * (printed as a QR code; Code 128 works too), so a scan names exactly one unit: a second scan of the
 * same label is recognised, and a unit of an order that is not on this truck is refused.
 *
 * A unit is accounted for once it is scanned, or reported missing or damaged. When every unit of an
 * order is accounted for and at least one was scanned, the order is loaded ("loaded short" when some
 * were reported) and Order Management is told, as the loader who loaded it. An order with nothing
 * scanned stays allocated for the dispatcher to sort out. Missing and damaged reports alert the
 * depot's dispatchers and the outlet's store manager (loader.shortfall).
 *
 * Every write for a trip takes the trip's advisory lock first, so two scans of the same line cannot
 * both pass the "units left" check.
 */

export const LABEL_SEPARATOR = '|';

export function unitLabel(orderRef: string, sku: string, unit: number) {
  return [orderRef, sku, unit].join(LABEL_SEPARATOR);
}

function parseLabel(barcode: string) {
  const parts = barcode.trim().split(LABEL_SEPARATOR);
  const unit = Number(parts[2]);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !Number.isInteger(unit) || unit < 1) return null;
  return { orderRef: parts[0], sku: parts[1], unit };
}

interface LineProgress {
  sku: string;
  description: string;
  qty: number;
  scanned: number;
  missing: number;
  damaged: number;
  /** Units not yet scanned or reported. */
  remaining: number;
}

interface OrderProgress {
  orderRef: string;
  outletId: string;
  lines: LineProgress[];
  /** Every unit scanned or reported. */
  complete: boolean;
  /** Complete with at least one unit scanned: the order goes on the truck. */
  loaded: boolean;
  /** Order Management has accepted 'loaded'. */
  synced: boolean;
}

const sum = (lines: LineProgress[], key: 'qty' | 'scanned' | 'missing' | 'damaged' | 'remaining') =>
  lines.reduce((n, l) => n + l[key], 0);

async function lockTrip(client: PoolClient, tripId: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`loading:${tripId}`]);
}

/** Scans and reports so far for each order of the trip, line by line. */
async function tripProgress(db: PoolClient, trip: PlannedTrip): Promise<OrderProgress[]> {
  const refs = trip.stops.map((s) => s.orderRef);
  const [scans, shortfalls, loaded] = await Promise.all([
    db.query<{ order_ref: string; sku: string; n: number }>(
      'SELECT order_ref, sku, count(*)::int AS n FROM loading_scans WHERE order_ref = ANY($1) GROUP BY 1, 2',
      [refs],
    ),
    db.query<{ order_ref: string; sku: string; missing: number; damaged: number }>(
      `SELECT order_ref, sku,
              COALESCE(sum(missing_qty) FILTER (WHERE NOT damage_flag), 0)::int AS missing,
              COALESCE(sum(missing_qty) FILTER (WHERE damage_flag), 0)::int AS damaged
         FROM loading_shortfalls WHERE trip_id = $1 GROUP BY 1, 2`,
      [trip.tripId],
    ),
    db.query<{ order_ref: string; synced: boolean }>(
      'SELECT order_ref, synced_at IS NOT NULL AS synced FROM loaded_orders WHERE order_ref = ANY($1)',
      [refs],
    ),
  ]);
  const key = (ref: string, sku: string) => `${ref}\u0000${sku}`;
  const scanned = new Map(scans.rows.map((r) => [key(r.order_ref, r.sku), r.n]));
  const short = new Map(shortfalls.rows.map((r) => [key(r.order_ref, r.sku), r]));
  const synced = new Map(loaded.rows.map((r) => [r.order_ref, r.synced]));

  return trip.stops.map((stop) => {
    const lines = stop.items.map((item) => {
      const s = scanned.get(key(stop.orderRef, item.sku)) ?? 0;
      const sf = short.get(key(stop.orderRef, item.sku));
      const missing = sf?.missing ?? 0;
      const damaged = sf?.damaged ?? 0;
      return {
        sku: item.sku,
        description: item.description,
        qty: item.qty,
        scanned: s,
        missing,
        damaged,
        remaining: Math.max(0, item.qty - s - missing - damaged),
      };
    });
    const complete = lines.every((l) => l.remaining === 0);
    return {
      orderRef: stop.orderRef,
      outletId: stop.outletId,
      lines,
      complete,
      loaded: complete && sum(lines, 'scanned') > 0,
      synced: synced.get(stop.orderRef) ?? false,
    };
  });
}

/** Records the order as loaded once all its units are accounted for. Returns true the first time. */
async function markLoadedIfComplete(db: PoolClient, tripId: string, order: OrderProgress): Promise<boolean> {
  if (!order.loaded) return false;
  const res = await db.query(
    `INSERT INTO loaded_orders (order_ref, trip_id, scanned_units, missing_units, damaged_units)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (order_ref) DO NOTHING`,
    [order.orderRef, tripId, sum(order.lines, 'scanned'), sum(order.lines, 'missing'), sum(order.lines, 'damaged')],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Tells Order Management the order is loaded, with the caller's own token so its history shows the
 * loader who did it. An order that is already loaded there counts as done. Returns whether it is synced.
 */
async function syncLoaded(orderRef: string, bearer: string | undefined): Promise<boolean> {
  const { rows } = await pool.query<{ scanned_units: number; missing_units: number; damaged_units: number; synced: boolean }>(
    'SELECT scanned_units, missing_units, damaged_units, synced_at IS NOT NULL AS synced FROM loaded_orders WHERE order_ref = $1',
    [orderRef],
  );
  const row = rows[0];
  if (!row) return false;
  if (row.synced) return true;
  const short = [row.missing_units ? `${row.missing_units} missing` : '', row.damaged_units ? `${row.damaged_units} damaged` : '']
    .filter(Boolean)
    .join(', ');
  try {
    const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/${encodeURIComponent(orderRef)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(bearer ? { Authorization: bearer } : {}) },
      body: JSON.stringify({
        status: 'loaded',
        reason_note: short ? `Loaded short: ${short}` : `All ${row.scanned_units} units scanned`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const body: any = await res.json().catch(() => null);
    const alreadyLoaded = res.status === 409 && body?.error?.details?.from === 'loaded';
    if (!res.ok && !alreadyLoaded) {
      console.warn(`[loading] Order Management refused ${orderRef} -> loaded (${res.status}): ${body?.error?.message ?? ''}`);
      return false;
    }
  } catch (err: any) {
    console.warn(`[loading] Order Management unreachable for ${orderRef} -> loaded: ${err.message}`);
    return false;
  }
  await pool.query('UPDATE loaded_orders SET synced_at = CURRENT_TIMESTAMP WHERE order_ref = $1', [orderRef]);
  return true;
}

/**
 * The trip's loading row: started (in_progress) by its first start or scan, completed by dispatch.
 * Loading cannot start until the driver has marked arrival at the depot.
 */
async function ensureStarted(db: PoolClient, tripId: string, loaderId: string | null) {
  const manifest = await db.query('SELECT 1 FROM loading_manifests WHERE trip_id = $1', [tripId]);
  if (manifest.rowCount === 0) {
    const arrived = await db.query('SELECT 1 FROM driver_trip_progress WHERE trip_id = $1 AND depot_arrived_at IS NOT NULL', [tripId]);
    if (arrived.rowCount === 0) throw new HttpError(409, `The driver of trip ${tripId} has not arrived at the depot yet`);
  }
  const { rows } = await db.query<{ status: string }>(
    `INSERT INTO loading_manifests (trip_id, loader_id, status, started_at)
     VALUES ($1, $2, 'in_progress', CURRENT_TIMESTAMP)
     ON CONFLICT (trip_id) DO UPDATE SET started_at = COALESCE(loading_manifests.started_at, EXCLUDED.started_at)
     RETURNING status`,
    [tripId, loaderId],
  );
  if (rows[0].status === 'completed') throw new HttpError(409, `Trip ${tripId} has already been dispatched`);
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export class LoadingService {
  /** The trip's stops and lines with what has been scanned and reported so far. */
  static async progress(trip: PlannedTrip) {
    const client = await pool.connect();
    try {
      return await tripProgress(client, trip);
    } finally {
      client.release();
    }
  }

  /** Start Loading: the trip moves to the loader's "loading" queue. */
  static async start(tripId: string, user: AccessTokenPayload | undefined) {
    await ExecutionSyncService.assignedTrip(tripId, user);
    await inTransaction(async (client) => {
      await lockTrip(client, tripId);
      await ensureStarted(client, tripId, user?.userId ?? null);
    });
    return { tripId, status: 'loading' };
  }

  /** One unit label scanned at the truck. */
  static async scan(tripId: string, barcode: string, user: AccessTokenPayload | undefined, bearer?: string) {
    const trip = await ExecutionSyncService.assignedTrip(tripId, user);
    const label = parseLabel(barcode);
    if (!label) throw new HttpError(422, `"${barcode}" is not a unit label (expected ORDER|SKU|UNIT)`);
    const stop = trip.stops.find((s) => s.orderRef === label.orderRef);
    if (!stop) throw new HttpError(409, `${label.orderRef} is not on ${trip.vehicleId}; put this unit back`);
    const item = stop.items.find((i) => i.sku === label.sku);
    if (!item) throw new HttpError(422, `${label.orderRef} has no item ${label.sku}`);
    if (label.unit > item.qty) {
      throw new HttpError(422, `${label.orderRef} has ${item.qty} × ${item.description}; there is no unit ${label.unit}`);
    }

    const result = await inTransaction(async (client) => {
      await lockTrip(client, tripId);
      await ensureStarted(client, tripId, user?.userId ?? null);
      const before = (await tripProgress(client, trip)).find((o) => o.orderRef === stop.orderRef)!;
      const line = before.lines.find((l) => l.sku === item.sku)!;
      const inserted = await client.query(
        `INSERT INTO loading_scans (order_ref, sku, unit_no, trip_id, loader_id) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (order_ref, sku, unit_no) DO NOTHING`,
        [label.orderRef, label.sku, label.unit, tripId, user?.userId ?? null],
      );
      const duplicate = (inserted.rowCount ?? 0) === 0;
      if (!duplicate && line.remaining === 0) {
        throw new HttpError(
          409,
          `All ${item.qty} × ${item.description} for ${stop.outletId} are accounted for ` +
            `(${line.missing} reported missing, ${line.damaged} damaged); this unit was not counted`,
        );
      }
      const order = (await tripProgress(client, trip)).find((o) => o.orderRef === stop.orderRef)!;
      const newlyLoaded = await markLoadedIfComplete(client, tripId, order);
      return { duplicate, order, newlyLoaded };
    });
    const synced = result.newlyLoaded ? await syncLoaded(stop.orderRef, bearer) : result.order.synced;
    const line = result.order.lines.find((l) => l.sku === item.sku)!;
    return {
      status: result.duplicate ? 'duplicate' : 'scanned',
      orderRef: stop.orderRef,
      outletId: stop.outletId,
      sku: item.sku,
      description: item.description,
      unit: label.unit,
      line,
      order: { complete: result.order.complete, loaded: result.order.loaded, synced },
    };
  }

  /** Units of a line that will not be loaded; alerts the dispatcher and the outlet's store manager. */
  static async reportShortfall(tripId: string, input: ShortfallInput, user: AccessTokenPayload | undefined, bearer?: string) {
    const trip = await ExecutionSyncService.assignedTrip(tripId, user);
    const stop = trip.stops.find((s) => s.orderRef === input.orderRef);
    if (!stop) throw new HttpError(422, `${input.orderRef} is not on ${trip.vehicleId}`);
    const item = stop.items.find((i) => i.sku === input.sku);
    if (!item) throw new HttpError(422, `${input.orderRef} has no item ${input.sku}`);
    const kind = input.damageFlag ? 'damaged' : 'missing';

    const result = await inTransaction(async (client) => {
      await lockTrip(client, tripId);
      await ensureStarted(client, tripId, user?.userId ?? null);
      const before = (await tripProgress(client, trip)).find((o) => o.orderRef === stop.orderRef)!;
      const line = before.lines.find((l) => l.sku === item.sku)!;
      if (input.missingQty > line.remaining) {
        throw new HttpError(
          422,
          `Only ${line.remaining} of ${item.qty} × ${item.description} are not yet scanned or reported`,
        );
      }
      const { rows } = await client.query(
        `INSERT INTO loading_shortfalls (trip_id, order_ref, sku, missing_qty, damage_flag, notes, loader_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [tripId, input.orderRef, input.sku, input.missingQty, input.damageFlag, input.notes || null, user?.userId ?? null],
      );
      const n = input.missingQty;
      const what = `${n} × ${item.description}`;
      await enqueueAlert(client, {
        type: 'loader.shortfall',
        sourceRole: 'loader',
        actorId: user?.userId ?? null,
        actorName: user?.username ?? null,
        depot: trip.depot,
        outletId: stop.outletId,
        vehicleId: trip.vehicleId,
        tripId,
        orderRef: stop.orderRef,
        summary: `${what} ${kind} at loading`,
        detail:
          `${what} for ${stop.outletId} (${stop.orderRef}) ${n === 1 ? 'was' : 'were'} ` +
          `${kind === 'damaged' ? 'damaged and removed' : 'missing'} at loading on ${trip.vehicleId}, ${trip.depot}.` +
          (input.notes ? ` Note: ${input.notes}` : ''),
        payload: { kind, sku: item.sku, description: item.description, quantity: n, notes: input.notes || null },
        occurredAt: new Date().toISOString(),
      });
      const order = (await tripProgress(client, trip)).find((o) => o.orderRef === stop.orderRef)!;
      const newlyLoaded = await markLoadedIfComplete(client, tripId, order);
      return { shortfall: rows[0], order, newlyLoaded };
    });
    void relayPendingAlerts();
    const synced = result.newlyLoaded ? await syncLoaded(stop.orderRef, bearer) : result.order.synced;
    return {
      shortfall: result.shortfall,
      line: result.order.lines.find((l) => l.sku === item.sku)!,
      order: { complete: result.order.complete, loaded: result.order.loaded, synced },
    };
  }

  /**
   * Release the truck: every unit must be scanned or reported, and Order Management must have every
   * loaded order (retried here if an earlier call failed).
   */
  static async dispatch(tripId: string, user: AccessTokenPayload | undefined, loaderId: string | undefined, bearer?: string) {
    const trip = await ExecutionSyncService.assignedTrip(tripId, user);
    const orders = await LoadingService.progress(trip);
    const open = orders.flatMap((o) =>
      o.lines.filter((l) => l.remaining > 0).map((l) => ({ orderRef: o.orderRef, outletId: o.outletId, sku: l.sku, remaining: l.remaining })),
    );
    if (open.length > 0) {
      throw new HttpError(409, `${open.reduce((n, l) => n + l.remaining, 0)} unit(s) are not scanned or reported yet`, { open });
    }
    for (const o of orders.filter((o) => o.loaded && !o.synced)) {
      if (!(await syncLoaded(o.orderRef, bearer))) {
        throw new HttpError(502, `Order Management has not accepted ${o.orderRef} as loaded yet; try again`);
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO loading_manifests (trip_id, loader_id, status, started_at, completed_at)
       VALUES ($1, $2, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (trip_id) DO UPDATE
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP, loader_id = EXCLUDED.loader_id
       RETURNING *`,
      [tripId, loaderId || null],
    );
    return {
      ...rows[0],
      loadedOrders: orders.filter((o) => o.loaded).map((o) => o.orderRef),
      notLoaded: orders.filter((o) => !o.loaded).map((o) => o.orderRef),
    };
  }
}
