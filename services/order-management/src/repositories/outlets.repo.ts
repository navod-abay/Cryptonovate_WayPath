import { env } from '../config/env.js';
import { pool, type Queryable } from '../db/pool.js';
import { appError } from '../domain/errors.js';
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
 * Where outlet master data comes from. `local` reads this service's outlets_ref mirror;
 * `http` will delegate to Fleet & Directory once it exposes outlets. The optional `db`
 * lets local writes join the caller's transaction.
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

/**
 * Placeholder for when Fleet & Directory owns outlets. Reads are delegated over HTTP;
 * fairness-counter writes are not yet part of Fleet's contract, so they fail loudly
 * rather than silently dropping audit-relevant state.
 */
export class HttpOutletDirectory implements OutletDirectory {
  constructor(private readonly baseUrl: string) {}

  async findById(outletId: string): Promise<OutletRef | null> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/outlets/${encodeURIComponent(outletId)}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    } catch (err) {
      console.error(`❌ Fleet & Directory unreachable at ${url}:`, err);
      throw appError('DB_UNAVAILABLE', 'Outlet directory (Fleet & Directory) is unavailable');
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      throw appError('DB_UNAVAILABLE', `Outlet directory returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as { data?: OutletRef } | OutletRef;
    return 'data' in body && body.data ? body.data : (body as OutletRef);
  }

  async markDeferred(): Promise<void> {
    throw appError('NOT_IMPLEMENTED', 'OUTLET_SOURCE=http does not yet support fairness-counter writes');
  }

  async markServed(): Promise<void> {
    throw appError('NOT_IMPLEMENTED', 'OUTLET_SOURCE=http does not yet support fairness-counter writes');
  }

  async incrementDaysSinceServed(): Promise<number> {
    throw appError('NOT_IMPLEMENTED', 'OUTLET_SOURCE=http does not yet support fairness-counter writes');
  }
}

export const outletDirectory: OutletDirectory =
  env.OUTLET_SOURCE === 'http' ? new HttpOutletDirectory(env.FLEET_SERVICE_URL) : new LocalOutletDirectory();

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
