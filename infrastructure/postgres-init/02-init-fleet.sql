-- ==============================================================================
-- PostgreSQL Schema: 02-init-fleet.sql
-- Owns: Fleet & Directory Service Data (Vehicles, Outlets, Travel Metrics)
-- ==============================================================================

-- Ensure uuid-ossp is available (fuel_logs table depends on uuid_generate_v4())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS outlets (
    outlet_id VARCHAR(20) PRIMARY KEY,
    brand VARCHAR(50) NOT NULL,
    district VARCHAR(50) NOT NULL,
    depot VARCHAR(50) NOT NULL,
    dock_type VARCHAR(50),
    parking_constraint VARCHAR(50),
    mall_window VARCHAR(50),
    window_open_time TIME,
    window_close_time TIME,
    name VARCHAR(100),
    address VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id VARCHAR(20) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    temp VARCHAR(50) NOT NULL,
    weight_cap_kg NUMERIC NOT NULL,
    volume_cap_m3 NUMERIC NOT NULL,
    fuel_type VARCHAR(50),
    km_per_l NUMERIC,
    weekly_fuel_quota_l NUMERIC,
    depot VARCHAR(50) NOT NULL,
    weekly_range_km NUMERIC,
    status VARCHAR(50) DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS district_travel (
    district VARCHAR(50) NOT NULL,
    depot VARCHAR(50) NOT NULL,
    road_class VARCHAR(50),
    free_flow_kmh NUMERIC,
    depot_to_district_km NUMERIC,
    depot_to_district_freeflow_min NUMERIC,
    inter_stop_km NUMERIC,
    inter_stop_freeflow_min NUMERIC,
    PRIMARY KEY (district, depot)
);

CREATE TABLE IF NOT EXISTS service_allowance (
    brand VARCHAR(50) NOT NULL,
    dock_type VARCHAR(50) NOT NULL,
    service_allowance_min NUMERIC NOT NULL,
    PRIMARY KEY (brand, dock_type)
);

CREATE TABLE IF NOT EXISTS fuel_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id VARCHAR(20) REFERENCES vehicles(vehicle_id),
    iso_year INTEGER NOT NULL,
    week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
    distance_run_km NUMERIC NOT NULL,
    liters_consumed NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_downtime (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id VARCHAR(20) NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_downtime_dates CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_downtime_vehicle ON vehicle_downtime(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_downtime_dates  ON vehicle_downtime(date_from, date_to);

-- 2. Natively Seed Data from the mounted CSV files
COPY outlets (outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window, window_open_time, window_close_time) 
FROM '/data/General Data/outlets.csv' DELIMITER ',' CSV HEADER NULL '';

-- The dataset has no outlet names or addresses. Give every outlet a readable name built from its
-- brand, district and id; addresses stay empty until real ones are loaded into the column.
UPDATE outlets SET name = brand || ' ' || district || ' (' || outlet_id || ')' WHERE name IS NULL;

-- Demo address for the demo outlet (OUT001, the one the seeded store manager belongs to).
UPDATE outlets SET address = 'No. 45, Galle Road, Colombo 03' WHERE outlet_id = 'OUT001' AND address IS NULL;

COPY vehicles (vehicle_id, type, temp, weight_cap_kg, volume_cap_m3, fuel_type, km_per_l, weekly_fuel_quota_l, depot, weekly_range_km) 
FROM '/data/General Data/vehicles.csv' DELIMITER ',' CSV HEADER NULL '';

COPY district_travel (district, depot, road_class, free_flow_kmh, depot_to_district_km, depot_to_district_freeflow_min, inter_stop_km, inter_stop_freeflow_min) 
FROM '/data/General Data/district_travel.csv' DELIMITER ',' CSV HEADER NULL '';

COPY service_allowance (brand, dock_type, service_allowance_min) 
FROM '/data/General Data/service_allowance.csv' DELIMITER ',' CSV HEADER NULL '';