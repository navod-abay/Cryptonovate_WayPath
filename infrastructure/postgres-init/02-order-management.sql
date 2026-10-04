-- ============================================================================
-- 02-order-management.sql
-- Owner: Order Management service (port 5002). SOLE owner of the tables below.
-- Additive by contract: CREATE ... IF NOT EXISTS only. No ALTER/DROP. No FK to
-- tables owned by other services. No shared ENUM types. Safe to re-run.
-- Applied on a fresh volume by docker-entrypoint-initdb.d, or manually:
--   docker compose exec -T postgres psql -U postgres -d delivery_db < this_file
-- ============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------- outlets_ref
-- Read-mostly mirror of the outlet directory. Fleet & Directory will own the
-- authoritative `outlets` table later; this service reads its own copy so it can
-- be built, run and tested standalone. Swap via OUTLET_SOURCE.
CREATE TABLE IF NOT EXISTS outlets_ref (
  outlet_id               VARCHAR(20)  PRIMARY KEY,
  brand                   VARCHAR(10)  NOT NULL CHECK (brand IN ('Fresh','Style','Tech')),
  district                VARCHAR(50)  NOT NULL,
  depot                   VARCHAR(20)  NOT NULL CHECK (depot IN ('Peliyagoda','Kandy')),
  dock_type               VARCHAR(20)  NOT NULL CHECK (dock_type IN ('rear_dock','street','mall_bay')),
  parking_constraint      VARCHAR(20)  NOT NULL CHECK (parking_constraint IN ('normal','van_only','mall_dock')),
  mall_window             BOOLEAN      NOT NULL DEFAULT false,
  window_open_time        TIME         NOT NULL,
  window_close_time       TIME         NOT NULL,
  deferred_yesterday      BOOLEAN      NOT NULL DEFAULT false,
  days_since_last_served  INTEGER      NOT NULL DEFAULT 0 CHECK (days_since_last_served >= 0),
  last_served_date        DATE         NULL,
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (window_close_time > window_open_time)
);

-- --------------------------------------------------------------------- orders
CREATE TABLE IF NOT EXISTS orders (
  order_ref            VARCHAR(32)  PRIMARY KEY,
  outlet_id            VARCHAR(20)  NOT NULL REFERENCES outlets_ref(outlet_id),
  brand                VARCHAR(10)  NOT NULL CHECK (brand IN ('Fresh','Style','Tech')),
  depot                VARCHAR(20)  NOT NULL CHECK (depot IN ('Peliyagoda','Kandy')),

  order_date           DATE         NOT NULL,   -- requested delivery day (moves on deferral)
  original_order_date  DATE         NOT NULL,   -- never changes after confirm; deferral fairness baseline
  requested_order_date DATE         NULL,       -- explicit date asked for at creation; NULL = next run

  temp_requirement     VARCHAR(10)  NOT NULL CHECK (temp_requirement IN ('ambient','chilled')),
  status               VARCHAR(20)  NOT NULL CHECK (status IN (
                          'draft','confirmed','allocated','loaded','out_for_delivery',
                          'delivered','received','disputed','deferred','not_run','cancelled')),

  order_units          INTEGER      NOT NULL DEFAULT 0 CHECK (order_units >= 0),
  order_weight_kg      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (order_weight_kg >= 0),
  order_volume_m3      NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (order_volume_m3 >= 0),

  -- snapshot of the outlet's window AT CREATION. Later outlet changes must not
  -- retroactively alter an open order, and Task 1 lateness needs a fixed reference.
  window_open_time     TIME         NOT NULL,
  window_close_time    TIME         NOT NULL,

  placed_by            UUID         NULL,        -- JWT `sub`
  placed_by_username   VARCHAR(50)  NOT NULL,
  placed_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  confirmed_at         TIMESTAMPTZ  NULL,
  cutoff_applied_at    TIMESTAMPTZ  NULL,

  deferral_count       INTEGER      NOT NULL DEFAULT 0 CHECK (deferral_count >= 0),

  vehicle_id           VARCHAR(20)  NULL,        -- written by Planning
  trip_id              SMALLINT     NULL CHECK (trip_id IN (1,2)),

  idempotency_key         VARCHAR(100) NULL,
  idempotency_fingerprint VARCHAR(64)  NULL,     -- sha256 of the canonical create payload
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- A Fresh outlet may hold one ambient AND one chilled order for the same date,
-- so uniqueness is on the TRIPLE, not (outlet_id, order_date).
-- Partial: a cancelled/aged-out order must not block a re-order, and a carried-over
-- (deferred at least once) order must not collide with the outlet's own order for
-- the day it was moved to — Fresh outlets order every operating day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_outlet_date_temp
  ON orders (outlet_id, order_date, temp_requirement)
  WHERE status NOT IN ('cancelled','not_run') AND deferral_count = 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency
  ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_orders_date_status   ON orders (order_date, status);
CREATE INDEX IF NOT EXISTS ix_orders_depot_date    ON orders (depot, order_date, status);
CREATE INDEX IF NOT EXISTS ix_orders_outlet_date   ON orders (outlet_id, order_date);
CREATE INDEX IF NOT EXISTS ix_orders_deferral      ON orders (deferral_count) WHERE deferral_count > 0;

-- ---------------------------------------------------------------- order_items
-- The challenge datasets have NO line-item grain: an order is a single aggregate
-- row (order_units / order_weight_kg / order_volume_m3). This table is our own
-- addition so the store-manager UI can show a real basket. Order totals are
-- ALWAYS derived from these rows so they stay consistent with the given datasets.
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref       VARCHAR(32)   NOT NULL REFERENCES orders(order_ref) ON DELETE CASCADE,
  sku             VARCHAR(40)   NOT NULL,
  description     VARCHAR(200)  NOT NULL,
  quantity        INTEGER       NOT NULL CHECK (quantity > 0),
  unit_weight_kg  NUMERIC(8,3)  NOT NULL CHECK (unit_weight_kg >= 0),
  unit_volume_m3  NUMERIC(8,4)  NOT NULL CHECK (unit_volume_m3 >= 0),
  is_chilled      BOOLEAN       NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (order_ref, sku)
);
CREATE INDEX IF NOT EXISTS ix_order_items_ref ON order_items (order_ref);

-- -------------------------------------------------------- order_status_events
-- APPEND-ONLY. This table is the answer to the booklet's "deferrals lack a clear
-- record" problem. Never UPDATE or DELETE a row here. Every single status change
-- writes exactly one row, in the same transaction as the status change itself.
CREATE TABLE IF NOT EXISTS order_status_events (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref    VARCHAR(32)  NOT NULL REFERENCES orders(order_ref) ON DELETE CASCADE,
  from_status  VARCHAR(20)  NULL,
  to_status    VARCHAR(20)  NOT NULL,
  reason_code  VARCHAR(40)  NULL,
  reason_note  TEXT         NULL,
  actor_id     UUID         NULL,
  actor_role   VARCHAR(20)  NULL,
  occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_events_order ON order_status_events (order_ref, occurred_at);

-- ------------------------------------------------------------- order_receipts
CREATE TABLE IF NOT EXISTS order_receipts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref       VARCHAR(32)  NOT NULL UNIQUE REFERENCES orders(order_ref) ON DELETE CASCADE,
  received_units  INTEGER      NOT NULL CHECK (received_units >= 0),
  missing_units   INTEGER      NOT NULL DEFAULT 0 CHECK (missing_units >= 0),
  rejected_units  INTEGER      NOT NULL DEFAULT 0 CHECK (rejected_units >= 0),
  note            TEXT         NULL,
  received_by     UUID         NULL,
  received_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Per-item detail of what was missing or damaged; totals match missing_units / rejected_units.
-- [{ "sku": "CH-YOG", "kind": "damaged", "quantity": 1, "reasons": ["Crushed"] }]
ALTER TABLE order_receipts ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]'::jsonb;

-- --------------------------------------------------------------- order_alert_outbox
-- Alerts written in the same transaction as the change they describe, then relayed to the
-- NATS ALERTS stream. published_at stays NULL until the broker has acknowledged the message.
CREATE TABLE IF NOT EXISTS order_alert_outbox (
  id            UUID         PRIMARY KEY,
  subject       VARCHAR(100) NOT NULL,
  envelope      JSONB        NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ  NULL
);
CREATE INDEX IF NOT EXISTS ix_order_alert_outbox_pending ON order_alert_outbox (created_at) WHERE published_at IS NULL;

-- --------------------------------------------------------------- service_jobs
-- Makes the 16:00 cutoff sweep (and demo seeding) idempotent across restarts and replicas.
CREATE TABLE IF NOT EXISTS service_jobs (
  job_name   VARCHAR(50) NOT NULL,
  job_key    VARCHAR(50) NOT NULL,   -- e.g. the order_date being closed
  ran_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  result     JSONB       NULL,
  PRIMARY KEY (job_name, job_key)
);

-- ------------------------------------------------------------ orders_ref_seq
-- Race-safe order_ref suffix. Name is service-specific on purpose.
CREATE SEQUENCE IF NOT EXISTS orders_ref_seq;

COMMIT;
