import { pool, type Queryable } from '../db/pool.js';
import type { Brand, Depot, DockType, ParkingConstraint } from '../schemas/orders.schema.js';

export interface OutletRef {
  outlet_id: string;
  brand: Brand;
  district: string;
  depot: Depot;
  dock_type: DockType;
  parking_constraint: ParkingConstraint;
  mall_window: boolean;
  window_open_time: string; // HH:mm
  window_close_time: string; // HH:mm
  deferred_yesterday: boolean;
  days_since_last_served: number;
  last_served_date: string | null;
}

/**
 * Reads and fairness-counter writes against outlets_ref, this service's local copy of the
 * outlet directory. Fleet & Directory owns the master data in its `outlets` table (same
 * database); syncOutletsFromDirectory() below copies it across. The copy exists because the
 * fairness counters have no home in Fleet's table and orders reference it by foreign key. The optional `db` lets writes join the
 * caller's transaction.
 */
export interface OutletDirectory {
  findById(outletId: string, db?: Queryable): Promise<OutletRef | null>;
  markDeferred(outletId: string, db?: Queryable): Promise<void>;
  markServed(outletId: string, servedOn: string, db?: Queryable): Promise<void>;
  incrementDaysSinceServed(exceptServedOn: string, db?: Queryable): Promise<number>;
}

export const OUTLET_COLUMNS = `
  outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window,
  to_char(window_open_time, 'HH24:MI')  AS window_open_time,
  to_char(window_close_time, 'HH24:MI') AS window_close_time,
  deferred_yesterday, days_since_last_served, last_served_date`;

export class LocalOutletDirectory implements OutletDirectory {
  async findById(outletId: string, db: Queryable = pool): Promise<OutletRef | null> {
    const { rows } = await db.query<OutletRef>(`SELECT ${OUTLET_COLUMNS} FROM outlets_ref WHERE outlet_id = $1`, [outletId]);
    return rows[0] ?? null;
  }

  async markDeferred(outletId: string, db: Queryable = pool): Promise<void> {
    await db.query(`UPDATE outlets_ref SET deferred_yesterday = true, updated_at = now() WHERE outlet_id = $1`, [outletId]);
  }

  async markServed(outletId: string, servedOn: string, db: Queryable = pool): Promise<void> {
    // GREATEST keeps last_served_date monotonic if receipts arrive out of order.
    await db.query(
      `UPDATE outlets_ref
          SET days_since_last_served = 0,
              last_served_date       = GREATEST(COALESCE(last_served_date, $2::date), $2::date),
              deferred_yesterday     = false,
              updated_at             = now()
        WHERE outlet_id = $1`,
      [outletId, servedOn],
    );
  }

  async incrementDaysSinceServed(exceptServedOn: string, db: Queryable = pool): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE outlets_ref o
          SET days_since_last_served = o.days_since_last_served + 1, updated_at = now()
        WHERE NOT EXISTS (
          SELECT 1 FROM orders x
           WHERE x.outlet_id = o.outlet_id AND x.order_date = $1::date
             AND x.status IN ('delivered','received','disputed'))`,
      [exceptServedOn],
    );
    return rowCount ?? 0;
  }
}

export const outletDirectory: OutletDirectory = new LocalOutletDirectory();

export interface OutletMaster {
  outlet_id: string;
  brand: Brand;
  district: string;
  depot: Depot;
  dock_type: DockType;
  parking_constraint: ParkingConstraint;
  mall_window: boolean;
  window_open_time: string;
  window_close_time: string;
}

/** Fleet & Directory's outlet table in the shared database, and the columns read from it. */
export const OUTLET_DIRECTORY_TABLE = 'outlets';
export const OUTLET_DIRECTORY_COLUMNS = [
  'outlet_id', 'brand', 'district', 'depot', 'dock_type', 'parking_constraint', 'mall_window',
  'window_open_time', 'window_close_time',
] as const;

// A source row is copied only if it satisfies outlets_ref's own constraints; anything else is
// counted as skipped and reported, never written.
const VALID_SOURCE_ROW = `
      o.brand IN ('Fresh','Style','Tech')
  AND o.depot IN ('Peliyagoda','Kandy')
  AND o.dock_type IN ('rear_dock','street','mall_bay')
  AND o.parking_constraint IN ('normal','van_only','mall_dock')
  AND o.window_open_time IS NOT NULL
  AND o.window_close_time IS NOT NULL
  AND o.window_close_time > o.window_open_time`;

/**
 * Copies outlet master data from Fleet & Directory's `outlets` table into outlets_ref, in the
 * database, with one statement. Existing rows are corrected when the source changed; fairness
 * counters are never touched. Pass an outlet id to copy just that outlet.
 *
 * Fleet stores the mall access range as text ("10:00-12:00") or NULL; outlets_ref keeps a
 * flag, because the range always equals the outlet's delivery window.
 */
export async function syncOutletsFromDirectory(
  outletId?: string,
  db: Queryable = pool,
): Promise<{ changed: number; total: number; skipped: number }> {
  const { rowCount } = await db.query(
    `INSERT INTO outlets_ref (outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window,
                              window_open_time, window_close_time)
     SELECT o.outlet_id, o.brand, o.district, o.depot, o.dock_type, o.parking_constraint,
            NULLIF(btrim(o.mall_window), '') IS NOT NULL,
            o.window_open_time, o.window_close_time
       FROM ${OUTLET_DIRECTORY_TABLE} o
      WHERE ($1::varchar IS NULL OR o.outlet_id = $1)
        AND ${VALID_SOURCE_ROW}
     ON CONFLICT (outlet_id) DO UPDATE SET
       brand = EXCLUDED.brand, district = EXCLUDED.district, depot = EXCLUDED.depot,
       dock_type = EXCLUDED.dock_type, parking_constraint = EXCLUDED.parking_constraint,
       mall_window = EXCLUDED.mall_window, window_open_time = EXCLUDED.window_open_time,
       window_close_time = EXCLUDED.window_close_time, updated_at = now()
     WHERE (outlets_ref.brand, outlets_ref.district, outlets_ref.depot, outlets_ref.dock_type,
            outlets_ref.parking_constraint, outlets_ref.mall_window, outlets_ref.window_open_time,
            outlets_ref.window_close_time)
           IS DISTINCT FROM
           (EXCLUDED.brand, EXCLUDED.district, EXCLUDED.depot, EXCLUDED.dock_type,
            EXCLUDED.parking_constraint, EXCLUDED.mall_window, EXCLUDED.window_open_time,
            EXCLUDED.window_close_time)`,
    [outletId ?? null],
  );
  const { rows } = await db.query<{ total: number; valid: number }>(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${VALID_SOURCE_ROW})::int AS valid
       FROM ${OUTLET_DIRECTORY_TABLE} o
      WHERE ($1::varchar IS NULL OR o.outlet_id = $1)`,
    [outletId ?? null],
  );
  return { changed: rowCount ?? 0, total: rows[0].total, skipped: rows[0].total - rows[0].valid };
}

export async function listOutlets(db: Queryable = pool): Promise<OutletRef[]> {
  const { rows } = await db.query<OutletRef>(`SELECT ${OUTLET_COLUMNS} FROM outlets_ref ORDER BY outlet_id`);
  return rows;
}

export async function clearDeferredForServed(servedOn: string, db: Queryable): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE outlets_ref o
        SET deferred_yesterday = false, updated_at = now()
      WHERE o.deferred_yesterday
        AND EXISTS (
          SELECT 1 FROM orders x
           WHERE x.outlet_id = o.outlet_id AND x.order_date = $1::date
             AND x.status IN ('delivered','received','disputed'))`,
    [servedOn],
  );
  return rowCount ?? 0;
}

export interface AtRiskRow {
  outlet_id: string;
  brand: Brand;
  district: string;
  depot: Depot;
  deferred_yesterday: boolean;
  days_since_last_served: number;
  last_served_date: string | null;
  max_deferral_count: number;
  open_orders: number;
  overdue_open_orders: number;
  aged_out_orders: number;
}

/**
 * An outlet is at risk of a repeat skip when any of these hold:
 *  - an order has been deferred >= minDeferrals times (recently or still open),
 *  - it was deferred on the last run (deferred_yesterday),
 *  - an order aged out (not_run) within the lookback window,
 *  - it has gone >= minDays operating days unserved AND has an order already past its
 *    original date. Requiring overdue demand keeps weekly-cadence outlets (Style) that
 *    simply have not ordered from flooding the list.
 */
export async function findAtRiskOutlets(
  params: { depot?: Depot; minDeferrals: number; minDays: number; lookbackFrom: string; today: string },
  db: Queryable = pool,
): Promise<AtRiskRow[]> {
  const { rows } = await db.query<AtRiskRow>(
    `WITH recent AS (
       SELECT outlet_id,
              MAX(deferral_count)::int AS max_deferral_count,
              COUNT(*) FILTER (WHERE status IN ('confirmed','deferred','allocated','loaded','out_for_delivery'))::int
                AS open_orders,
              COUNT(*) FILTER (WHERE status IN ('confirmed','deferred','allocated','loaded','out_for_delivery')
                                 AND original_order_date < $5::date)::int
                AS overdue_open_orders,
              COUNT(*) FILTER (WHERE status = 'not_run')::int AS aged_out_orders
         FROM orders
        WHERE original_order_date >= $1::date
           OR status IN ('confirmed','deferred','allocated','loaded','out_for_delivery')
        GROUP BY outlet_id
     )
     SELECT o.outlet_id, o.brand, o.district, o.depot, o.deferred_yesterday, o.days_since_last_served,
            o.last_served_date,
            COALESCE(r.max_deferral_count, 0)  AS max_deferral_count,
            COALESCE(r.open_orders, 0)         AS open_orders,
            COALESCE(r.overdue_open_orders, 0) AS overdue_open_orders,
            COALESCE(r.aged_out_orders, 0)     AS aged_out_orders
       FROM outlets_ref o
       LEFT JOIN recent r ON r.outlet_id = o.outlet_id
      WHERE ($2::varchar IS NULL OR o.depot = $2)
        AND (COALESCE(r.max_deferral_count, 0) >= $3
             OR o.deferred_yesterday
             OR COALESCE(r.aged_out_orders, 0) > 0
             OR (o.days_since_last_served >= $4 AND COALESCE(r.overdue_open_orders, 0) > 0))
      ORDER BY max_deferral_count DESC, o.days_since_last_served DESC, o.outlet_id`,
    [params.lookbackFrom, params.depot ?? null, params.minDeferrals, params.minDays, params.today],
  );
  return rows;
}
