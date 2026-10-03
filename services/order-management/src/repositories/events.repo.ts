import { pool, type Queryable } from '../db/pool.js';
import type { OrderStatus } from '../domain/statusMachine.js';

export interface StatusEventRow {
  id: string;
  order_ref: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  reason_code: string | null;
  reason_note: string | null;
  actor_id: string | null;
  actor_role: string | null;
  occurred_at: Date;
}

export interface NewStatusEvent {
  orderRef: string;
  from: OrderStatus | null;
  to: OrderStatus;
  reasonCode?: string | null;
  reasonNote?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
}

/**
 * Append-only. clock_timestamp() (not now()) so several events written in one
 * transaction still sort in the order they happened.
 */
export async function appendEvent(event: NewStatusEvent, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO order_status_events (order_ref, from_status, to_status, reason_code, reason_note, actor_id, actor_role, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
    [
      event.orderRef,
      event.from,
      event.to,
      event.reasonCode ?? null,
      event.reasonNote ?? null,
      event.actorId ?? null,
      event.actorRole ?? null,
    ],
  );
}

const EVENT_COLUMNS = 'id, order_ref, from_status, to_status, reason_code, reason_note, actor_id, actor_role, occurred_at';

export async function listEvents(orderRef: string, db: Queryable = pool): Promise<StatusEventRow[]> {
  const { rows } = await db.query<StatusEventRow>(
    `SELECT ${EVENT_COLUMNS} FROM order_status_events WHERE order_ref = $1 ORDER BY occurred_at, id`,
    [orderRef],
  );
  return rows;
}

/** The latest `limit` events, returned oldest-first. */
export async function listRecentEvents(orderRef: string, limit: number, db: Queryable = pool): Promise<StatusEventRow[]> {
  const { rows } = await db.query<StatusEventRow>(
    `SELECT * FROM (
       SELECT ${EVENT_COLUMNS} FROM order_status_events WHERE order_ref = $1
        ORDER BY occurred_at DESC, id DESC LIMIT $2
     ) latest ORDER BY occurred_at, id`,
    [orderRef, limit],
  );
  return rows;
}
