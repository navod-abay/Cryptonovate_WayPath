-- ==============================================================================
-- PostgreSQL Seed Script: 01-seed.sql
-- Creates schema extensions, core tables, and initial seed users for RBAC
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM for User Roles
CREATE TYPE user_role AS ENUM ('dispatcher', 'loader', 'driver', 'store_manager');

-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast user lookup by email and role
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Seed Initial Accounts (Passwords are mocked bcrypt hashes for 'Password123!')
-- Hash: $2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/067571342621763421
INSERT INTO users (id, username, email, password_hash, role, first_name, last_name)
VALUES 
    (
        '11111111-1111-4111-a111-111111111111',
        'dispatcher_admin',
        'dispatcher@delivery.com',
        '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/067571342621763421',
        'dispatcher',
        'Sarah',
        'Conner'
    ),
    (
        '22222222-2222-4222-a222-222222222222',
        'loader_jack',
        'loader@delivery.com',
        '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/067571342621763421',
        'loader',
        'Jack',
        'Miller'
    ),
    (
        '33333333-3333-4333-a333-333333333333',
        'driver_bob',
        'driver@delivery.com',
        '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/067571342621763421',
        'driver',
        'Bob',
        'Vance'
    ),
    (
        '44444444-4444-4444-a444-444444444444',
        'store_manager_alice',
        'store_manager@delivery.com',
        '$2a$12$eImiTXuWVxfM37uY4JANjO5E.y/g4/067571342621763421',
        'store_manager',
        'Alice',
        'Smith'
    )
ON CONFLICT (email) DO NOTHING;

-- Verification summary log
SELECT id, username, email, role, created_at FROM users;
