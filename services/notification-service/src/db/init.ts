import { pool } from './pool';

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // One row per alert. id comes from the producer (outbox id / device clientEventId), so a
    // message delivered twice by the broker is stored once. seq orders alerts by arrival here and
    // is the SSE event id used to replay what a reconnecting browser missed.
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY,
        seq BIGSERIAL UNIQUE,
        type VARCHAR(50) NOT NULL,
        source_role VARCHAR(20) NOT NULL,
        actor_id VARCHAR(64),
        actor_name VARCHAR(100),
        depot VARCHAR(50),
        outlet_id VARCHAR(50),
        vehicle_id VARCHAR(50),
        trip_id VARCHAR(50),
        order_ref VARCHAR(50),
        summary TEXT NOT NULL,
        detail TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        stored_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS ix_alerts_occurred ON alerts (occurred_at DESC);');
    await client.query('CREATE INDEX IF NOT EXISTS ix_alerts_outlet ON alerts (outlet_id, occurred_at DESC);');

    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_reads (
        alert_id UUID NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL,
        read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (alert_id, user_id)
      );
    `);

    await client.query('COMMIT');
    console.log('[db/init] Notification schema initialized.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
