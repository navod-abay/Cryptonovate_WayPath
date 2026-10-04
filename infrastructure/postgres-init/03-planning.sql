-- ==============================================================================
-- PostgreSQL Init Script: 03-planning.sql
-- Owner: Planning & Allocation service (port 5003). SOLE owner of the tables below.
--
-- One planning run per plan date produces the day's trips (vehicle schedule), their stops and the
-- items to load, plus the orders it deferred. Readers only see the plan of a COMPLETED run.
-- Order refs and vehicle ids belong to Order Management and Fleet; they are copied here without
-- foreign keys because each service owns its own tables.
-- Additive by contract: CREATE ... IF NOT EXISTS only.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS planning_runs (
  run_id           VARCHAR(40)  PRIMARY KEY,
  plan_date        DATE         NOT NULL,
  status           VARCHAR(12)  NOT NULL CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
  trigger          VARCHAR(12)  NOT NULL,
  requested_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ  NULL,
  finished_at      TIMESTAMPTZ  NULL,
  error            TEXT         NULL,
  fleet_available  JSONB        NULL,  -- {"Peliyagoda": 38, "Kandy": 22}: vehicles available on plan_date
  stats            JSONB        NULL
);

-- A date has at most one queued, running or completed run; failed runs are kept for the record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_runs_blocking ON planning_runs (plan_date) WHERE status <> 'FAILED';
CREATE INDEX IF NOT EXISTS idx_planning_runs_date ON planning_runs (plan_date);

CREATE TABLE IF NOT EXISTS planned_trips (
  trip_id             VARCHAR(40)  PRIMARY KEY,  -- <YYYYMMDD>-<vehicle_id>-T<trip_number>
  run_id              VARCHAR(40)  NOT NULL REFERENCES planning_runs(run_id) ON DELETE CASCADE,
  plan_date           DATE         NOT NULL,
  depot               VARCHAR(20)  NOT NULL,
  vehicle_id          VARCHAR(20)  NOT NULL,
  vehicle_type        VARCHAR(10)  NOT NULL,
  vehicle_temp        VARCHAR(10)  NOT NULL,
  weight_cap_kg       NUMERIC      NOT NULL,
  volume_cap_m3       NUMERIC      NOT NULL,
  trip_number         SMALLINT     NOT NULL CHECK (trip_number IN (1, 2)),
  brand               VARCHAR(10)  NOT NULL,
  district            VARCHAR(50)  NOT NULL,
  departure_time      VARCHAR(5)   NOT NULL,  -- HH:MM, Colombo time
  return_time         VARCHAR(5)   NOT NULL,
  duration_min        INTEGER      NOT NULL,
  distance_km         NUMERIC      NOT NULL,
  fuel_litres         NUMERIC      NOT NULL,
  weight_kg           NUMERIC      NOT NULL,
  volume_m3           NUMERIC      NOT NULL,
  weight_utilization  NUMERIC      NOT NULL,
  volume_utilization  NUMERIC      NOT NULL,
  UNIQUE (run_id, vehicle_id, trip_number)
);
CREATE INDEX IF NOT EXISTS idx_planned_trips_date ON planned_trips (plan_date, depot);

CREATE TABLE IF NOT EXISTS planned_stops (
  stop_id       VARCHAR(48)  PRIMARY KEY,  -- <trip_id>-S<sequence>
  trip_id       VARCHAR(40)  NOT NULL REFERENCES planned_trips(trip_id) ON DELETE CASCADE,
  sequence      SMALLINT     NOT NULL,
  order_ref     VARCHAR(32)  NOT NULL,
  outlet_id     VARCHAR(20)  NOT NULL,
  brand         VARCHAR(10)  NOT NULL,
  temperature   VARCHAR(10)  NOT NULL,
  weight_kg     NUMERIC      NOT NULL,
  volume_m3     NUMERIC      NOT NULL,
  eta           VARCHAR(5)   NOT NULL,
  window_open   VARCHAR(5)   NOT NULL,
  window_close  VARCHAR(5)   NOT NULL,
  late_min      NUMERIC      NOT NULL DEFAULT 0,
  UNIQUE (trip_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_planned_stops_order ON planned_stops (order_ref);

-- Order lines copied at planning time, so the loading manifest does not move if an order is edited.
CREATE TABLE IF NOT EXISTS planned_stop_items (
  stop_id      VARCHAR(48)  NOT NULL REFERENCES planned_stops(stop_id) ON DELETE CASCADE,
  line_no      SMALLINT     NOT NULL,
  sku          VARCHAR(40)  NOT NULL,
  description  TEXT         NOT NULL,
  quantity     INTEGER      NOT NULL,
  PRIMARY KEY (stop_id, line_no)
);

CREATE TABLE IF NOT EXISTS planned_deferrals (
  run_id          VARCHAR(40)  NOT NULL REFERENCES planning_runs(run_id) ON DELETE CASCADE,
  order_ref       VARCHAR(32)  NOT NULL,
  outlet_id       VARCHAR(20)  NOT NULL,
  depot           VARCHAR(20)  NOT NULL,
  district        VARCHAR(50)  NOT NULL,
  brand           VARCHAR(10)  NOT NULL,
  temperature     VARCHAR(10)  NOT NULL,
  weight_kg       NUMERIC      NOT NULL,
  volume_m3       NUMERIC      NOT NULL,
  order_date      DATE         NOT NULL,  -- the order's original order date
  times_deferred  INTEGER      NOT NULL,  -- deferrals before this run
  reason_code     VARCHAR(40)  NOT NULL,  -- Order Management deferral reason code
  reason_detail   TEXT         NOT NULL,
  PRIMARY KEY (run_id, order_ref)
);
