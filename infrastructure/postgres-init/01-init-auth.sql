-- ==============================================================================
-- PostgreSQL Init Script: 01-init-auth.sql
-- Owner: Auth & RBAC service (port 5001). Creates the users table and role enum.
--
-- Must stay in sync with services/auth-rbac/src/db/seed.ts, which runs the same
-- idempotent DDL on startup and provisions the seed accounts (with real bcrypt
-- hashes), so no users are inserted here.
-- ==============================================================================

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

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
