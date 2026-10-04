import { pool } from './pool';

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Telemetry Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        driver_id UUID,
        vehicle_id VARCHAR(50),
        latitude NUMERIC(10, 7) NOT NULL,
        longitude NUMERIC(10, 7) NOT NULL,
        speed NUMERIC(5, 2),
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Stop Executions
    await client.query(`
      CREATE TABLE IF NOT EXISTS stop_executions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        route_id VARCHAR(50) NOT NULL,
        stop_id VARCHAR(50) NOT NULL,
        status VARCHAR(30) DEFAULT 'completed',
        completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      );
    `);

    // Loading Manifests
    await client.query(`
      CREATE TABLE IF NOT EXISTS loading_manifests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        trip_id VARCHAR(50) NOT NULL UNIQUE,
        loader_id UUID,
        status VARCHAR(30) DEFAULT 'in_progress',
        completed_at TIMESTAMP WITH TIME ZONE
      );
    `);

    // Loading Shortfalls
    await client.query(`
      CREATE TABLE IF NOT EXISTS loading_shortfalls (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        trip_id VARCHAR(50) NOT NULL,
        order_ref VARCHAR(50) NOT NULL,
        sku VARCHAR(50) NOT NULL,
        missing_qty INT DEFAULT 0,
        damage_flag BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Scan-to-load (see LoadingService): when loading started, who reported a shortfall, every unit
    // label scanned (one row per unit, so a second scan of the same label is recognised), and the
    // orders whose units are all accounted for, with whether Order Management has been told.
    await client.query(`
      ALTER TABLE loading_manifests ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE loading_shortfalls ADD COLUMN IF NOT EXISTS loader_id UUID;
      CREATE INDEX IF NOT EXISTS ix_loading_shortfalls_trip ON loading_shortfalls (trip_id);

      CREATE TABLE IF NOT EXISTS loading_scans (
        order_ref VARCHAR(50) NOT NULL,
        sku VARCHAR(50) NOT NULL,
        unit_no INT NOT NULL,
        trip_id VARCHAR(50) NOT NULL,
        loader_id UUID,
        scanned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (order_ref, sku, unit_no)
      );
      CREATE INDEX IF NOT EXISTS ix_loading_scans_trip ON loading_scans (trip_id);

      CREATE TABLE IF NOT EXISTS loaded_orders (
        order_ref VARCHAR(50) PRIMARY KEY,
        trip_id VARCHAR(50) NOT NULL,
        scanned_units INT NOT NULL,
        missing_units INT NOT NULL,
        damaged_units INT NOT NULL,
        loaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced_at TIMESTAMP WITH TIME ZONE  -- when Order Management accepted 'loaded'
      );
    `);

    // Delivery Events (bulk sync target)
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        trip_id VARCHAR(50),
        order_ref VARCHAR(50) NOT NULL UNIQUE,
        outlet_id VARCHAR(50),
        actual_arrival_time TIMESTAMP WITH TIME ZONE,
        actual_service_duration_min INT,
        actual_departure_time TIMESTAMP WITH TIME ZONE,
        status VARCHAR(30) DEFAULT 'delivered',
        pod_signature TEXT,
        offline_captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
        synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Driver Incidents (roadside / at-outlet reports). id is generated on the device, so a report
    // re-sent after a dropped connection is recognised instead of stored twice.
    await client.query(`
      CREATE TABLE IF NOT EXISTS driver_incidents (
        id UUID PRIMARY KEY,
        driver_id UUID,
        driver_username VARCHAR(100),
        depot VARCHAR(50),
        trip_id VARCHAR(50),
        stop_id VARCHAR(50),
        outlet_id VARCHAR(50),
        order_ref VARCHAR(50),
        vehicle_id VARCHAR(50),
        issue VARCHAR(30) NOT NULL,
        action VARCHAR(40),
        notes TEXT,
        captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
        received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Problems a store manager reports about a delivery that has not arrived yet
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_problems (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        delivery_id VARCHAR(50) NOT NULL,
        order_ref VARCHAR(50),
        outlet_id VARCHAR(50),
        store_manager_id UUID,
        problems JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Store unloading: the store manager says the vehicle is at the outlet and unloading has started
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_unloadings (
        order_ref VARCHAR(50) PRIMARY KEY,
        outlet_id VARCHAR(50) NOT NULL,
        started_by UUID,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Handover code the driver enters at the outlet. The code itself is derived from `nonce`, not stored.
    await client.query(`
      CREATE TABLE IF NOT EXISTS handover_codes (
        order_ref VARCHAR(50) PRIMARY KEY,
        outlet_id VARCHAR(50) NOT NULL,
        nonce UUID NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Dashboard alerts waiting to be relayed to NATS (see services/alertOutbox.ts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS execution_alert_outbox (
        id UUID PRIMARY KEY,
        subject VARCHAR(100) NOT NULL,
        envelope JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        published_at TIMESTAMP WITH TIME ZONE
      );
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS ix_execution_alert_outbox_pending ON execution_alert_outbox (created_at) WHERE published_at IS NULL;'
    );

    await client.query('COMMIT');
    console.log('[db/init] Execution Sync database schema initialized successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[db/init] Error initializing database schema:', err);
  } finally {
    client.release();
  }
}
