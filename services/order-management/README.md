# Order Management Service (port 5002)

Owns **what needs to go where, and by when**: store orders, their line items, the 16:00 Asia/Colombo
ordering cutoff, the status lifecycle, deferrals with reasons, receipts, and an append-only audit trail.
It does not pick vehicles (Planning & Allocation), sequence stops, or capture proof of delivery (Execution & Sync).

Stack: Node 20, TypeScript (strict, NodeNext), Express 4, `pg` (raw SQL), Zod, `jsonwebtoken`.

Full endpoint reference, with logic, examples and errors: **[docs/API.md](docs/API.md)**.

## Run

Boot order: connect → assert schema → seed → listen → start the cutoff timer.

### What gets seeded

| Data | When | Controlled by |
|---|---|---|
| **Outlets** (`outlets_ref`): copied from Fleet & Directory's `outlets` table in the database | every boot, then every 5 minutes; inserted, or corrected if the source changed. Fairness counters are never overwritten | always on; the service will not start if the `outlets` table is missing |
| **Demo orders** (1,541): real orders from the challenge dataset, the last 11 operating days of `task1_test_inputs.csv` (2026-03-17 … 03-28, the window algorithm 3 was back-tested on), moved onto **2 operating days before today, today, and 8 after**. All are `confirmed`; units, weight and volume equal the dataset row (order lines carry readable product names and add up exactly). Outlet fairness counters (`days_since_last_served`, `deferred_yesterday`) come from the dataset history before that window | **once per database**, guarded by a `service_jobs('seed_demo','dataset-v1')` row | `SEED_DEMO_DATA` (default `true`) |

"Today" is the day the service seeds, or the last operating day when that is a Sunday or holiday.
Planning & Allocation then plans the past days and today when it starts (catch-up), oldest first, so
each day's deferrals roll into the next day's pool; the future days are planned by its daily 16:00 run.
After planning each **past** day it calls `POST /simulate-delivery` (role `system`, demo data only),
which takes that day's orders through loaded → out for delivery → delivered → received at the planned
times, records full receipts and marks the outlets served, so the next day's cutoff sweep sees who was
delivered. Today's orders stay `allocated`.

Catch-up does not search for these plans: they were solved once and are stored in
`services/planning-allocation/seed-data/plans.csv`, and a catch-up run whose orders match a stored day
(by outlet, temperature, weight and volume, so the dates and order refs do not matter) replays it. The
replayed plan is re-timed and checked against the day's fleet like a solved one; if it does not match
or no longer fits, that day is solved as before. After changing `orders.csv`, regenerate the stored
plans: start a stack on an empty volume with `PLANNING_SEEDED_PLANS=off`, let catch-up finish, run
`services/planning-allocation/scripts/export-seed-plans.sh` and rebuild the planning image.

The orders are in `seed-data/orders.csv` (one row per order, with a day `offset` instead of a date)
and the starting fairness counters in `seed-data/outlet_state.csv`. Both are copied into the image, so
`docker compose up` seeds without the dataset. To pick different days, regenerate them from the
dataset with `node services/order-management/scripts/build-seed-csv.mjs` (run from the repo root;
change `DAYS` / `PAST_DAYS` there). Each order keeps its dataset id in `idempotency_key`
(`dataset:ORD0097105`).

Because the seed is one-shot, **the flag only matters on a database that has not been seeded yet**.
Turning it off later does not delete existing orders, and turning it back on does not re-date them.
A database that still holds the earlier synthetic demo seed (`seed_demo/v1`) is left as it is; start
from an empty volume to get the dataset seed.

### With demo data (default)

```bash
cp .env.example .env                                  # once, from the repo root
docker compose up -d --build postgres auth-rbac fleet-directory order-management
docker compose logs order-management                  # expect "outlets_ref synced from Fleet's outlets table" and "Dataset orders seeded"
curl localhost:5002/health                            # direct
curl localhost/api/orders/health                      # through the gateway (needs the gateway up)
```

To re-date the demo to today, reset the volume. **This destroys all data in every service.**

```bash
docker compose down -v && docker compose up -d --build
```

### Without demo data (outlets only)

Add `SEED_DEMO_DATA=false` to the repo-root `.env`, then start on a database that has **not** been
seeded:

```bash
docker compose down -v                                # only if the volume was already seeded
docker compose up -d --build postgres auth-rbac order-management
docker compose logs order-management                  # expect "SEED_DEMO_DATA=false — skipping demo orders."
```

To keep your existing data and try an empty instance next to it, use a separate database:

```bash
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE om_empty;"
docker compose exec -T postgres psql -U postgres -d om_empty < infrastructure/postgres-init/02-order-management.sql
docker compose run --rm -d --no-deps --name om_empty -p 3102:3102 \
  -e PORT=3102 -e SEED_DEMO_DATA=false \
  -e DATABASE_URL=postgres://postgres:postgres_password@postgres:5432/om_empty order-management
curl localhost:3102/health
```

Without demo data, `npm run verify` passes **47/49**. Scenario 42 (the capacity summary on a seeded
day) and scenario 43 (pagination over 25+ rows) need the demo orders.

### Outside Docker (local Node)

```bash
cd services/order-management && npm install
cp .env.example .env        # then fill in PORT, DATABASE_URL, JWT_ACCESS_SECRET, FLEET_SERVICE_URL
npm run dev                 # tsx watch, auto-restart
```

Nothing is assumed: the service refuses to start and names each required setting that is missing.

If Postgres is also installed natively on Windows, it may already own the port your `DATABASE_URL`
points at, and a local run then connects to **it** instead of the container (symptom:
`database "…" does not exist`). Stop the native service, or run the service inside compose.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `❌ FATAL: missing table(s): …` and exit 1 | Migration not applied to this volume. Run Path B below. |
| `❌ FATAL: table "orders" exists but is missing required column(s)` | Another service created a same-named table. See the message. |
| auth-rbac: `column "full_name" of relation "users" does not exist` | Known repo issue with `01-seed.sql`. See NOTES.md, issue 1. |
| `env file … .env not found` | `cp .env.example .env` at the repo root. |
| verify scenarios 4–7 fail | `NODE_ENV=production` disables the `X-Test-Now` clock. `.env` must set `development`. |

## Swagger / OpenAPI

| Where | URL |
|---|---|
| Swagger UI served by this service | `<service or gateway origin>/api/orders/docs` |
| Raw spec | `<service or gateway origin>/api/orders/openapi.json` |
| Platform-wide Swagger UI (all services) | started with the compose `dev` profile; it reads `openapi.yaml`. Set `baseUrl` in its Servers box to the origin you are testing |

Every operation has named request-body examples, documented headers (`Authorization`,
`Idempotency-Key`, `X-Test-Now`), a success example, and one example per error code.

To try a call: log in through auth-rbac, press **Authorize**, paste the access token, pick an
example from the dropdown, then **Execute**.

The spec is code-first. `src/docs/openapi.ts` builds it from the same Zod schemas that validate
requests, and `openapi.yaml` is generated from it with `npm run openapi`. A unit test fails if a
route is added without documenting it, or if any request or response lacks an example.

## Reference data (dependency on Fleet & Directory)

Fleet & Directory owns outlets and vehicles. Order Management holds no copy of its own: there are
no embedded data files and no fallbacks.

| Data | Where it comes from | Used for |
|---|---|---|
| Outlets | Fleet's `outlets` table in the shared database (loaded from `data/outlets.csv` by `infrastructure/postgres-init/02-init-fleet.sql`) | brand, depot, district, dock, parking and delivery window when an order is created, and the outlet fields on `GET /confirmed` |
| Vehicles | Fleet's HTTP API, `GET /api/fleet/vehicles` | refrigerated capacity on `GET /summary`; vehicle IDs in the demo seed |

Outlets:

- **`outlets_ref` is our working copy**, filled from Fleet's table by one SQL statement at boot and
  every 5 minutes. It exists because the fairness counters (`deferred_yesterday`,
  `days_since_last_served`) have no place in Fleet's table, and orders reference it by foreign key.
- **An outlet added to Fleet's table works immediately.** If an order names an outlet that has not
  been copied yet, the table is checked before the request is rejected.
- **Rows that would break our constraints are skipped and reported**: unknown brand, depot, dock
  or parking value, or a missing delivery window.
- **The mall access range** (`"10:00-12:00"` in Fleet) is kept as a yes/no flag, because it always
  equals the outlet's delivery window.
- **If the `outlets` table is missing, the service will not start.** It prints which init script
  creates it. `GET /health` shows when outlets were last synced under `reference_data.outlets`.

Vehicles:

- **Status is live.** A reefer marked `in_workshop` in Fleet drops out of `/summary` capacity
  within 30 seconds (the cache time).
- **If Fleet is unreachable, capacity is reported as unavailable**: `available: false` and null
  figures. Nothing is estimated. Orders are not affected.
- **The demo seed needs Fleet's vehicles.** If Fleet is not up at first boot, the seed waits and
  retries every 15 seconds until it is.

Holidays come from `src/domain/holidays.ts`, the closed days in `calendar.csv`. That file ends on
2026-06-28; later holidays go in `HOLIDAY_DATES`.

## Database migration

All DDL lives in `infrastructure/postgres-init/02-order-management.sql`. It is additive only: no
`ALTER` or `DROP`, no foreign keys into other teams' tables, and safe to re-run. **The service never
issues DDL.** At boot it only *verifies* its tables and columns, and exits with a precise FATAL
message if they are missing.

Scripts in `postgres-init` only run on an **empty** volume. Two ways to apply the migration:

```bash
# Path A — fresh start (destroys all data)
docker compose down -v && docker compose up --build

# Path B — apply to a running stack without losing data (safe to repeat)
docker compose exec -T postgres psql -U postgres -d delivery_db < infrastructure/postgres-init/02-order-management.sql
```

## Endpoints

Paths are shown as the frontend sees them through the gateway. Direct calls to `localhost:5002`
work with or without the `/api/orders` prefix. Every route except `/health` requires
`Authorization: Bearer <access_token>`. Responses use `{ success, data }` or
`{ success: false, error: { code, message, details? } }`.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/orders/health` | public | Service and DB health (503 if the DB is down) |
| POST | `/api/orders` | store_manager (own), dispatcher | Create a draft. Optional `Idempotency-Key` header |
| PUT | `/api/orders/:ref/items` | store_manager (own), dispatcher | Replace the basket (draft, or confirmed before cutoff) |
| POST | `/api/orders/:ref/confirm` | store_manager (own), dispatcher | Confirm under the 16:00 cutoff; `{accept_next_run}` |
| DELETE | `/api/orders/:ref` | store_manager (own), dispatcher | Soft-cancel (draft/confirmed only) |
| GET | `/api/orders/` | store_manager (own), dispatcher, loader | List with filters and pagination |
| GET | `/api/orders/:ref` | store_manager (own), dispatcher, loader | Order with items and the latest 20 events |
| GET | `/api/orders/:ref/history` | store_manager (own), dispatcher | Full audit trail, oldest first |
| GET | `/api/orders/confirmed?date=&depot=` | dispatcher, loader | **Planning contract**: confirmed pool with outlet access fields and totals |
| PATCH | `/api/orders/status-batch` | dispatcher | Planning write-back (≤500 updates, all-or-nothing) |
| PATCH | `/api/orders/:ref/status` | loader (`loaded`), driver (`out_for_delivery`, `delivered`), dispatcher | Single status change from the dock or the road |
| POST | `/api/orders/:ref/defer` | dispatcher | Single deferral with a `reason_code` |
| GET | `/api/orders/at-risk?depot=&min_deferrals=&min_days=` | dispatcher | Outlets at risk of a repeat skip |
| GET | `/api/orders/summary?date=&depot=` | dispatcher | Counts by status/brand, chilled vs. ambient, reefer capacity check |
| POST | `/api/orders/:ref/receipt` | store_manager (own) | Record the receipt → `received` or `disputed` |
| POST | `/api/orders/close-window` | dispatcher | Run the cutoff sweep now (idempotent per date) |

Status machine: `draft → confirmed → allocated → loaded → out_for_delivery → delivered → received | disputed`.
`confirmed → deferred → confirmed` loops back into the pool. `deferred → not_run` happens after
`MAX_DEFERRALS`. `draft | confirmed → cancelled`.

Deferral reason codes: `CAPACITY_WEIGHT`, `CAPACITY_VOLUME`, `NO_REEFER_AVAILABLE`,
`NO_VAN_FOR_VAN_ONLY_OUTLET`, `WINDOW_INFEASIBLE`, `TIME_BUDGET_EXCEEDED`, `FUEL_QUOTA_EXCEEDED`,
`VEHICLE_UNAVAILABLE`, `LOWER_PRIORITY`, `DISPATCHER_OVERRIDE` (needs a `reason_note`), and
`AGED_OUT` (system only).

## Configuration

All configuration comes from the environment (`docker-compose.yml`, the host, or a local `.env`;
template in [.env.example](.env.example)). Addresses, ports and secrets have **no defaults in
code**, so a hosted deployment can never silently point at a development address.

Required — the service refuses to start without these:

| Var | Purpose |
|---|---|
| `PORT` | port to listen on |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | must equal auth-rbac's access-token secret |
| `FLEET_SERVICE_URL` | base URL of Fleet & Directory (vehicle data), without a path |

Optional:

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` disables the `X-Test-Now` test clock |
| `CORS_ALLOWED_ORIGINS` | empty (any origin) | comma-separated browser origins allowed to call the API |
| `FLEET_TIMEOUT_MS` | `3000` | per-request timeout for Fleet calls |
| `FLEET_RETRY_DELAY_MS` | `2000` | delay between retries when loading vehicles from Fleet |
| `OUTLET_REFRESH_INTERVAL_MS` | `300000` | how often `outlets_ref` is re-copied from Fleet's table |
| `ORDER_CUTOFF_HOUR` / `BUSINESS_TZ` | `16` / `Asia/Colombo` | ordering cutoff |
| `NON_OPERATING_WEEKDAYS` / `HOLIDAY_DATES` | `0` / empty | operating calendar |
| `MAX_DEFERRALS` / `AT_RISK_DAYS` | `3` / `3` | |
| `SEED_DEMO_DATA` | `true` | seed demo orders once |
| `CUTOFF_JOB_INTERVAL_MS` | `60000` | cutoff timer tick |
| `CHILLED_TRIPS_PER_DAY` | `1` | chilled trips a reefer can make before the 08:00 deadline; used by `/summary` |

## Tests

```bash
npm test              # unit tests (node:test): calendar + dataset holidays, cutoff table, status machine,
                      # rollups, refs, reasons, Fleet vehicle mapping, and route-vs-OpenAPI coverage
npm run verify        # 49 endpoint scenarios against a running stack
npm run openapi       # regenerate openapi.yaml from src/docs/openapi.ts
npm run openapi:check # fail if openapi.yaml is stale
```

`verify` needs to be told where the stack is. Copy [.env.verify.example](.env.verify.example) to
`.env.verify` (git-ignored) and set `BASE_URL` and `AUTH_URL`, or pass them in the environment. It
stops with a message if they are missing.

It writes its orders onto a synthetic far-future week (unique per run), and freezes the clock with
the `X-Test-Now` header, which requires `NODE_ENV !== 'production'`. It logs in with the seeded
accounts. If auth-rbac is down, set `AUTH_MODE=mint` and `JWT_ACCESS_SECRET`: it then signs dev
tokens itself and marks scenario 2 as SKIP.

Unit tests and `npm run openapi` load [.env.test](.env.test), which holds placeholder values only.

See [NOTES.md](NOTES.md) for deviations from the plan and issues found elsewhere in the repo.
