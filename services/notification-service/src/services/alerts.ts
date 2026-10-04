import { z } from 'zod';
import { pool } from '../db/pool';
import { AccessTokenPayload, UserRole } from '../middleware/auth';

/** Envelope published by the producers (order-management, execution-sync) on alerts.<type>. */
export const AlertEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(50),
  sourceRole: z.enum(['driver', 'store_manager', 'loader', 'dispatcher']),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  depot: z.string().nullable(),
  outletId: z.string().nullable(),
  vehicleId: z.string().nullable(),
  tripId: z.string().nullable(),
  orderRef: z.string().nullable(),
  summary: z.string(),
  detail: z.string(),
  payload: z.record(z.unknown()).default({}),
  occurredAt: z.string().datetime({ offset: true }),
  recordedAt: z.string().datetime({ offset: true }),
});
export type AlertEnvelope = z.infer<typeof AlertEnvelopeSchema>;

export interface AlertRow {
  id: string;
  seq: number;
  type: string;
  source_role: string;
  actor_id: string | null;
  actor_name: string | null;
  depot: string | null;
  outlet_id: string | null;
  vehicle_id: string | null;
  trip_id: string | null;
  order_ref: string | null;
  summary: string;
  detail: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
  received_at: Date;
  read?: boolean;
}

/**
 * Who sees which alert type. Store managers only ever see alerts about their own outlet that
 * someone else raised; the outlet always comes from their token.
 */
const AUDIENCE: Record<string, UserRole[]> = {
  'driver.incident': ['dispatcher', 'store_manager'],
  'driver.offline_delivery': ['dispatcher'],
  'store.discrepancy': ['dispatcher'],
  'store.delivery_problem': ['dispatcher'],
  // Units missing or damaged at loading: the depot's dispatchers and the outlet's store manager.
  'loader.shortfall': ['dispatcher', 'store_manager'],
};
const audienceOf = (type: string) => AUDIENCE[type] ?? ['dispatcher'];
const typesFor = (role: UserRole) => Object.keys(AUDIENCE).filter((t) => AUDIENCE[t].includes(role));

/** Reported long after it happened, i.e. queued on a device during an outage. */
const SYNCED_LATE_MS = 5 * 60_000;
const syncedLate = (row: AlertRow) => row.received_at.getTime() - row.occurred_at.getTime() > SYNCED_LATE_MS;

export function canSee(user: AccessTokenPayload, row: AlertRow): boolean {
  if (!audienceOf(row.type).includes(user.role)) return false;
  if (user.role === 'dispatcher') return !user.depot || !row.depot || user.depot === row.depot;
  if (user.role === 'store_manager') {
    return !!user.outlet_id && row.outlet_id === user.outlet_id && row.source_role !== 'store_manager';
  }
  return false;
}

/** SQL twin of canSee(): returns a WHERE clause over table alias `a` and its parameters. */
function visibilityFilter(user: AccessTokenPayload, params: unknown[]): string {
  if (user.role === 'dispatcher') {
    params.push(typesFor('dispatcher'), user.depot || null);
    return `a.type = ANY($${params.length - 1}) AND ($${params.length}::text IS NULL OR a.depot IS NULL OR a.depot = $${params.length})`;
  }
  if (user.role === 'store_manager') {
    params.push(typesFor('store_manager'), user.outlet_id || null);
    return `a.type = ANY($${params.length - 1}) AND a.outlet_id = $${params.length} AND a.source_role <> 'store_manager'`;
  }
  return 'FALSE';
}

// ------------------------------------------------------------------ views

/** Matches the dispatcher app's Incident (frontend/src/dispatcher/data/types.ts) plus timing fields. */
export function dispatcherView(row: AlertRow) {
  const kind = row.source_role === 'driver' ? 'driver' : row.source_role === 'loader' ? 'warehouse' : 'store';
  const source =
    kind === 'driver'
      ? row.vehicle_id || row.actor_name || 'Driver'
      : kind === 'warehouse'
        ? row.depot || 'Warehouse'
        : row.outlet_id || row.actor_name || 'Store';
  return {
    id: row.id,
    type: row.type,
    kind,
    source,
    summary: row.summary,
    detail: row.detail,
    createdAt: row.occurred_at.toISOString(),
    occurredAt: row.occurred_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    syncedLate: syncedLate(row),
    vehicleId: row.vehicle_id ?? undefined,
    orderId: row.order_ref ?? undefined,
    outletId: row.outlet_id ?? undefined,
    tripId: row.trip_id ?? undefined,
    read: !!row.read,
  };
}

/** Matches the store manager app's Update (frontend/src/store_manager/src/types.ts). */
export function storeUpdateView(row: AlertRow) {
  const source = row.source_role === 'driver' || row.source_role === 'loader' ? row.source_role : 'dispatcher';
  return {
    id: row.id,
    source,
    message: row.detail || row.summary,
    at: row.occurred_at.toISOString(),
    link: row.type === 'driver.incident' ? '/deliveries/today' : undefined,
    read: !!row.read,
    syncedLate: syncedLate(row),
  };
}

export const viewFor = (user: AccessTokenPayload, row: AlertRow) =>
  user.role === 'store_manager' ? storeUpdateView(row) : dispatcherView(row);

// ------------------------------------------------------------------ storage

/** Returns the stored row, or null when this alert id was already stored (redelivery). */
export async function storeAlert(alert: AlertEnvelope): Promise<AlertRow | null> {
  const { rows } = await pool.query<AlertRow>(
    `INSERT INTO alerts (
       id, type, source_role, actor_id, actor_name, depot, outlet_id, vehicle_id, trip_id, order_ref,
       summary, detail, payload, occurred_at, received_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [
      alert.id, alert.type, alert.sourceRole, alert.actorId, alert.actorName, alert.depot, alert.outletId,
      alert.vehicleId, alert.tripId, alert.orderRef, alert.summary, alert.detail, JSON.stringify(alert.payload),
      alert.occurredAt, alert.recordedAt,
    ],
  );
  return rows[0] ?? null;
}

const SELECT_WITH_READ = `
  SELECT a.*, (r.alert_id IS NOT NULL) AS read
    FROM alerts a
    LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = $1`;

/** Newest first by when it happened, so an alert synced late after an outage sorts where it belongs. */
export async function listAlerts(user: AccessTokenPayload, opts: { limit: number; before?: string }): Promise<AlertRow[]> {
  const params: unknown[] = [user.sub];
  const where = [visibilityFilter(user, params)];
  if (opts.before) {
    params.push(opts.before);
    where.push(`a.occurred_at < $${params.length}`);
  }
  params.push(opts.limit);
  const { rows } = await pool.query<AlertRow>(
    `${SELECT_WITH_READ} WHERE ${where.join(' AND ')} ORDER BY a.occurred_at DESC, a.seq DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export async function getAlert(user: AccessTokenPayload, id: string): Promise<AlertRow | null> {
  const params: unknown[] = [user.sub];
  const where = visibilityFilter(user, params);
  params.push(id);
  const { rows } = await pool.query<AlertRow>(`${SELECT_WITH_READ} WHERE ${where} AND a.id = $${params.length}`, params);
  return rows[0] ?? null;
}

/** Everything this user may see that arrived after the given seq (SSE replay on reconnect). */
export async function alertsAfter(user: AccessTokenPayload, seq: number, limit = 500): Promise<AlertRow[]> {
  const params: unknown[] = [user.sub];
  const where = visibilityFilter(user, params);
  params.push(seq, limit);
  const { rows } = await pool.query<AlertRow>(
    `${SELECT_WITH_READ} WHERE ${where} AND a.seq > $${params.length - 1} ORDER BY a.seq LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export async function latestSeq(): Promise<number> {
  const { rows } = await pool.query<{ seq: string | null }>('SELECT MAX(seq) AS seq FROM alerts');
  return Number(rows[0].seq ?? 0);
}

/** Marks alerts read for this user; ids the user cannot see are ignored. */
export async function markRead(user: AccessTokenPayload, ids: string[]): Promise<void> {
  const params: unknown[] = [user.sub];
  const where = visibilityFilter(user, params);
  params.push(ids);
  await pool.query(
    `INSERT INTO alert_reads (alert_id, user_id)
     SELECT a.id, $1 FROM alerts a WHERE ${where} AND a.id = ANY($${params.length}::uuid[])
     ON CONFLICT DO NOTHING`,
    params,
  );
}
