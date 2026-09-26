import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

export async function initDatabaseAndSeed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create table & types if not existing
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      DO $$ BEGIN
        CREATE TYPE user_role_enum AS ENUM ('dispatcher', 'loader', 'driver', 'store_manager');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        role user_role_enum NOT NULL,
        outlet_id VARCHAR(20) NULL,
        depot VARCHAR(50) NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Check if seeding is necessary or idempotent update
    const passwordHash = await bcrypt.hash('Password123!', 10);

    const seedAccounts = [
      {
        username: 'dispatcher_admin',
        password_hash: passwordHash,
        full_name: 'System Dispatcher Admin',
        role: 'dispatcher',
        outlet_id: null,
        depot: 'Peliyagoda',
      },
      {
        username: 'loader_peliyagoda',
        password_hash: passwordHash,
        full_name: 'Peliyagoda Dock Loader',
        role: 'loader',
        outlet_id: null,
        depot: 'Peliyagoda',
      },
      {
        username: 'driver_colombo',
        password_hash: passwordHash,
        full_name: 'Colombo Route Driver',
        role: 'driver',
        outlet_id: null,
        depot: 'Peliyagoda',
      },
      {
        username: 'manager_out001',
        password_hash: passwordHash,
        full_name: 'OUT001 Store Manager',
        role: 'store_manager',
        outlet_id: 'OUT001',
        depot: null,
      },
    ];

    for (const account of seedAccounts) {
      await client.query(
        `
        INSERT INTO users (username, password_hash, full_name, role, outlet_id, depot)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (username) 
        DO UPDATE SET 
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          outlet_id = EXCLUDED.outlet_id,
          depot = EXCLUDED.depot;
        `,
        [
          account.username,
          account.password_hash,
          account.full_name,
          account.role,
          account.outlet_id,
          account.depot,
        ]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Auth-RBAC Database schema verified and seed accounts provisioned.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to initialize database and seed accounts:', err);
    throw err;
  } finally {
    client.release();
  }
}
