import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import path from 'path';
import { pool } from './pool';
import { pinLookup } from '../services/pin.service';

/** One driver per vehicle (scripts/build-driver-seed.mjs writes it from the challenge dataset). */
function readDrivers() {
  const file = path.resolve(__dirname, '../../seed-data/drivers.csv');
  const [head, ...lines] = readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
}

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

      ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS outlet_id VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS depot VARCHAR(50);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
      -- Loaders (depot kiosk) and drivers (their phone) sign in with a 4-digit PIN (POST /pin-login),
      -- stored as a keyed hash that is unique per role and depot (services/pin.service.ts).
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_lookup VARCHAR(64);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_pin ON users (role, lower(depot), pin_lookup) WHERE pin_lookup IS NOT NULL;
      -- A driver account belongs to one vehicle: the driver sees that vehicle's trips.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_id VARCHAR(20);
      -- Older databases had a required email column; only relax it where it still exists.
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email'
        ) THEN
          ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
        END IF;
      END $$;
    `);

    // Check if seeding is necessary or idempotent update
    const passwordHash = await bcrypt.hash('Password123!', 10);

    const seedAccounts = [
      {
        username: 'dispatcher_admin',
        password_hash: passwordHash,
        full_name: 'System Dispatcher Admin',
        email: 'dispatcher.admin@waypath.example',
        phone: '+94 70 000 0001',
        role: 'dispatcher',
        outlet_id: null,
        depot: 'Peliyagoda',
      },
      // Loaders: every depot needs at least one, since Planning shares each day's vehicles among
      // the depot's loaders. PINs identify the loader at the depot kiosk, so they must differ
      // within a depot.
      ...[
        { username: 'loader_peliyagoda', full_name: 'Thilak Senanayake', depot: 'Peliyagoda', pin: '1234' },
        { username: 'loader_peliyagoda_2', full_name: 'Nuwan Perera', depot: 'Peliyagoda', pin: '2345' },
        { username: 'loader_peliyagoda_3', full_name: 'Kasun Fernando', depot: 'Peliyagoda', pin: '3456' },
        { username: 'loader_kandy', full_name: 'Ruwan Jayasinghe', depot: 'Kandy', pin: '4567' },
        { username: 'loader_kandy_2', full_name: 'Chaminda Bandara', depot: 'Kandy', pin: '5678' },
      ].map((l) => ({ ...l, password_hash: passwordHash, role: 'loader', outlet_id: null })),
      {
        username: 'driver_colombo',
        password_hash: passwordHash,
        full_name: 'Colombo Route Driver',
        email: 'driver.colombo@waypath.example',
        phone: '+94 70 000 0003',
        role: 'driver',
        outlet_id: null,
        depot: 'Peliyagoda',
      },
      // Drivers: one per vehicle, PIN "1" + the vehicle number (VEH001 -> 1001).
      ...readDrivers().map((d) => ({
        username: d.username,
        password_hash: passwordHash,
        full_name: d.full_name,
        role: 'driver',
        outlet_id: null,
        depot: d.depot,
        vehicle_id: d.vehicle_id,
        pin: d.pin,
      })),
      {
        username: 'manager_out001',
        password_hash: passwordHash,
        full_name: 'Nimal Fernando',
        email: 'manager.out001@waypath.example',
        phone: '+94 70 000 0004',
        role: 'store_manager',
        outlet_id: 'OUT001',
        depot: null,
      },
    ];

    const pinsSeen = new Set<string>();
    for (const account of seedAccounts) {
      const pin = 'pin' in account ? account.pin : null;
      const role = account.role as 'loader' | 'driver';
      if (pin !== null) {
        const key = `${role}:${account.depot}:${pin}`;
        if (pinsSeen.has(key)) throw new Error(`Seed PIN ${pin} is used by two ${role}s at ${account.depot}`);
        pinsSeen.add(key);
      }
      await client.query(
        `
        INSERT INTO users (username, password_hash, full_name, role, outlet_id, depot, vehicle_id, pin_lookup, email, phone)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (username) 
        DO UPDATE SET 
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          outlet_id = EXCLUDED.outlet_id,
          depot = EXCLUDED.depot,
          vehicle_id = EXCLUDED.vehicle_id,
          pin_lookup = EXCLUDED.pin_lookup,
          email = COALESCE(users.email, EXCLUDED.email),
          phone = COALESCE(users.phone, EXCLUDED.phone);
        `,
        [
          account.username,
          account.password_hash,
          account.full_name,
          account.role,
          account.outlet_id,
          account.depot,
          'vehicle_id' in account ? account.vehicle_id : null,
          pin === null || !account.depot ? null : pinLookup(role, account.depot, pin),
          'email' in account ? account.email : null,
          'phone' in account ? account.phone : null,
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
