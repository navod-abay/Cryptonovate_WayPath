import { AckPolicy, connect, DeliverPolicy, nanos, NatsConnection, RetentionPolicy, StorageType } from 'nats';
import { config } from '../config';
import { AlertEnvelopeSchema, storeAlert } from './alerts';
import { broadcast } from './hub';

const STREAM = 'ALERTS';
const DURABLE = 'notification-service';
const RETRY_MS = 5_000;

let connection: NatsConnection | undefined;
let stopped = false;

/** Same definition as the producers': whoever starts first creates the stream. */
async function ensureStreamAndConsumer(nc: NatsConnection) {
  const jsm = await nc.jetstreamManager();
  try {
    await jsm.streams.info(STREAM);
  } catch {
    await jsm.streams.add({
      name: STREAM,
      subjects: ['alerts.>'],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_age: nanos(30 * 24 * 60 * 60 * 1000),
      duplicate_window: nanos(60 * 60 * 1000),
    });
  }
  try {
    await jsm.consumers.info(STREAM, DURABLE);
  } catch {
    // Durable: the broker remembers what this service has acknowledged across restarts,
    // so alerts published while it was down are delivered when it comes back.
    await jsm.consumers.add(STREAM, {
      durable_name: DURABLE,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      ack_wait: nanos(30_000),
    });
  }
}

async function consume(nc: NatsConnection) {
  const consumer = await nc.jetstream().consumers.get(STREAM, DURABLE);
  const messages = await consumer.consume();
  for await (const msg of messages) {
    const parsed = AlertEnvelopeSchema.safeParse(msg.json());
    if (!parsed.success) {
      // Redelivering a malformed message would never succeed.
      console.error(`[consumer] Dropping malformed alert on ${msg.subject}:`, parsed.error.issues);
      msg.term();
      continue;
    }
    try {
      const row = await storeAlert(parsed.data);
      msg.ack();
      if (row) broadcast(row);
    } catch (err) {
      console.error(`[consumer] Could not store alert ${parsed.data.id}; will retry:`, err);
      msg.nak(RETRY_MS);
    }
  }
}

/** Connects (retrying until NATS is up) and consumes until stopped. */
export async function startConsumer() {
  while (!stopped) {
    try {
      const nc = await connect({ servers: config.natsUrl, name: 'notification-service', maxReconnectAttempts: -1 });
      connection = nc;
      await ensureStreamAndConsumer(nc);
      console.log('[consumer] Consuming ALERTS from NATS');
      await consume(nc);
      // The message iterator only ends when the connection does; start over with a new one.
      await nc.close().catch(() => undefined);
    } catch (err: any) {
      if (stopped) return;
      console.warn(`[consumer] NATS unavailable (${err.message}); retrying in ${RETRY_MS / 1000}s`);
      await connection?.close().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

export async function stopConsumer() {
  stopped = true;
  await connection?.drain().catch(() => undefined);
}
