import { randomUUID } from 'node:crypto';
import { connect, JSONCodec, nanos, RetentionPolicy, StorageType, type JetStreamClient, type NatsConnection } from 'nats';
import { env } from '../config/env.js';
import { pool, type Queryable } from '../db/pool.js';

/**
 * Alerts for the dispatcher / store manager dashboards (notification-service consumes them).
 *
 * Written to order_alert_outbox inside the caller's transaction, so an alert exists exactly when the
 * change it describes was committed. The relay below publishes pending rows to the NATS ALERTS
 * stream; the outbox id doubles as the JetStream Nats-Msg-Id and the alert's primary key, so a
 * re-published row is dropped as a duplicate.
 */
export interface AlertEnvelope {
  id: string;
  type: 'store.discrepancy';
  sourceRole: 'store_manager';
  actorId: string | null;
  actorName: string | null;
  depot: string | null;
  outletId: string | null;
  vehicleId: string | null;
  tripId: string | null;
  orderRef: string | null;
  summary: string;
  detail: string;
  payload: Record<string, unknown>;
  /** When it happened (business time). */
  occurredAt: string;
  /** When this service learned about it. */
  recordedAt: string;
}

export const ALERTS_STREAM = 'ALERTS';
const RELAY_INTERVAL_MS = 5_000;
const BATCH_SIZE = 50;

export async function enqueueAlert(db: Queryable, alert: Omit<AlertEnvelope, 'id' | 'recordedAt'>): Promise<string> {
  const envelope: AlertEnvelope = { ...alert, id: randomUUID(), recordedAt: new Date().toISOString() };
  await db.query('INSERT INTO order_alert_outbox (id, subject, envelope) VALUES ($1, $2, $3)', [
    envelope.id,
    `alerts.${envelope.type}`,
    JSON.stringify(envelope),
  ]);
  return envelope.id;
}

const codec = JSONCodec<AlertEnvelope>();
let connection: NatsConnection | undefined;
let jetstream: JetStreamClient | undefined;
let relayTimer: NodeJS.Timeout | undefined;
let relaying = false;
let stopped = false;

/** Shared with the other producers and the consumer: whoever starts first creates the stream. */
async function ensureStream(nc: NatsConnection) {
  const jsm = await nc.jetstreamManager();
  try {
    await jsm.streams.info(ALERTS_STREAM);
  } catch {
    await jsm.streams.add({
      name: ALERTS_STREAM,
      subjects: ['alerts.>'],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_age: nanos(30 * 24 * 60 * 60 * 1000),
      duplicate_window: nanos(60 * 60 * 1000),
    });
  }
}

async function connectBroker() {
  while (!stopped && !jetstream) {
    try {
      const nc = await connect({ servers: env.NATS_URL, name: 'order-management', maxReconnectAttempts: -1 });
      await ensureStream(nc);
      connection = nc;
      jetstream = nc.jetstream();
      console.log('📣 Alert relay connected to NATS');
    } catch (err) {
      console.warn(`⚠️ Alert relay cannot reach NATS (${(err as Error).message}); retrying in ${RELAY_INTERVAL_MS / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, RELAY_INTERVAL_MS));
    }
  }
}

/** Publishes pending outbox rows. Safe to call often: one run at a time, rows locked while sent. */
export async function relayPendingAlerts(): Promise<void> {
  if (!jetstream || relaying) return;
  relaying = true;
  const client = await pool.connect();
  try {
    for (;;) {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string; subject: string; envelope: AlertEnvelope }>(
        `SELECT id, subject, envelope FROM order_alert_outbox
          WHERE published_at IS NULL ORDER BY created_at LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED`,
      );
      const published: string[] = [];
      for (const row of rows) {
        try {
          await jetstream.publish(row.subject, codec.encode(row.envelope), { msgID: row.id });
          published.push(row.id);
        } catch (err) {
          console.warn(`⚠️ Alert ${row.id} not published yet: ${(err as Error).message}`);
          break;
        }
      }
      if (published.length > 0) {
        await client.query('UPDATE order_alert_outbox SET published_at = now() WHERE id = ANY($1::uuid[])', [published]);
      }
      await client.query('COMMIT');
      if (published.length < BATCH_SIZE) break;
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('❌ Alert relay failed:', err);
  } finally {
    client.release();
    relaying = false;
  }
}

export function startAlertRelay() {
  stopped = false;
  void connectBroker().then(relayPendingAlerts);
  relayTimer = setInterval(() => void relayPendingAlerts(), RELAY_INTERVAL_MS);
  relayTimer.unref();
}

export async function stopAlertRelay() {
  stopped = true;
  if (relayTimer) clearInterval(relayTimer);
  await connection?.drain().catch(() => undefined);
}
