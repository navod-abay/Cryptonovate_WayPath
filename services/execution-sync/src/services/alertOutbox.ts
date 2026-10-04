import { randomUUID } from 'crypto';
import { connect, JSONCodec, nanos, RetentionPolicy, StorageType, JetStreamClient, NatsConnection } from 'nats';
import { PoolClient } from 'pg';
import { pool } from '../db/pool';

const NATS_URL = process.env.NATS_URL || 'nats://nats:4222';

/**
 * Alerts for the dispatcher / store manager dashboards (notification-service consumes them).
 *
 * Written to execution_alert_outbox inside the caller's transaction, then relayed to the NATS ALERTS stream.
 * The alert id is also the JetStream Nats-Msg-Id and the alert's primary key downstream, so a row
 * that is published twice (relay crash, driver re-sending the same report) is stored once.
 */
export type AlertType = 'driver.incident' | 'driver.offline_delivery' | 'driver.arrived' | 'store.delivery_problem' | 'loader.shortfall';

export interface AlertEnvelope {
  id: string;
  type: AlertType;
  sourceRole: 'driver' | 'store_manager' | 'loader';
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
  /** When it happened: the device's capture time for anything that may have queued offline. */
  occurredAt: string;
  /** When this service received it. */
  recordedAt: string;
}

export const ALERTS_STREAM = 'ALERTS';
const RELAY_INTERVAL_MS = 5_000;
const BATCH_SIZE = 50;

/** Returns false when an alert with this id was already queued. */
export async function enqueueAlert(
  client: PoolClient,
  alert: Omit<AlertEnvelope, 'id' | 'recordedAt'> & { id?: string },
): Promise<boolean> {
  const envelope: AlertEnvelope = { ...alert, id: alert.id || randomUUID(), recordedAt: new Date().toISOString() };
  const res = await client.query(
    'INSERT INTO execution_alert_outbox (id, subject, envelope) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [envelope.id, `alerts.${envelope.type}`, JSON.stringify(envelope)],
  );
  return (res.rowCount ?? 0) > 0;
}

const codec = JSONCodec<AlertEnvelope>();
let connection: NatsConnection | undefined;
let jetstream: JetStreamClient | undefined;
let relayTimer: NodeJS.Timeout | undefined;
let relaying = false;

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
  while (!jetstream) {
    try {
      const nc = await connect({ servers: NATS_URL, name: 'execution-sync', maxReconnectAttempts: -1 });
      await ensureStream(nc);
      connection = nc;
      jetstream = nc.jetstream();
      console.log('[alerts] Relay connected to NATS');
    } catch (err: any) {
      console.warn(`[alerts] Cannot reach NATS (${err.message}); retrying in ${RELAY_INTERVAL_MS / 1000}s`);
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
        `SELECT id, subject, envelope FROM execution_alert_outbox
          WHERE published_at IS NULL ORDER BY created_at LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED`,
      );
      const published: string[] = [];
      for (const row of rows) {
        try {
          await jetstream.publish(row.subject, codec.encode(row.envelope), { msgID: row.id });
          published.push(row.id);
        } catch (err: any) {
          console.warn(`[alerts] Alert ${row.id} not published yet: ${err.message}`);
          break;
        }
      }
      if (published.length > 0) {
        await client.query('UPDATE execution_alert_outbox SET published_at = now() WHERE id = ANY($1::uuid[])', [published]);
      }
      await client.query('COMMIT');
      if (published.length < BATCH_SIZE) break;
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[alerts] Relay failed:', err);
  } finally {
    client.release();
    relaying = false;
  }
}

export function startAlertRelay() {
  void connectBroker().then(relayPendingAlerts);
  relayTimer = setInterval(() => void relayPendingAlerts(), RELAY_INTERVAL_MS);
  relayTimer.unref();
}

export async function stopAlertRelay() {
  if (relayTimer) clearInterval(relayTimer);
  await connection?.drain().catch(() => undefined);
}
