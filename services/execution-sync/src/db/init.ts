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

    // Delivery Disputes
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_disputes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_ref VARCHAR(50) NOT NULL,
        store_manager_id UUID,
        discrepancy_type VARCHAR(50) NOT NULL,
        description TEXT,
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

    await client.query('COMMIT');
    console.log('[db/init] Execution Sync database schema initialized successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[db/init] Error initializing database schema:', err);
  } finally {
    client.release();
  }
}
