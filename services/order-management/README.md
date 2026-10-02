# Order Management Service (port 3002)

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
| **120 outlets** (`outlets_ref`): a snapshot of the real `data/outlets.csv`, the same file Fleet & Directory loads, so both agree | every boot; inserted, or corrected if the master attributes drifted. Fairness counters are never overwritten | always on while `OUTLET_SOURCE=local`, because orders cannot be placed without outlets |
| **Demo orders** (~1,700): 2 weeks of history, a live board for today, a peak day tomorrow whose Peliyagoda chilled demand is ~1.4× the real reefer capacity (9 reefers, 207.5 m³), at-risk outlets, one `draft` on OUT001. Orders are generated (the dataset has no order file for the live system); outlets and vehicle IDs are real | **once per database**, guarded by a `service_jobs('seed_demo','v1')` row | `SEED_DEMO_DATA` (default `true`) |

Seed data is deterministic (fixed PRNG seed) and dated relative to the day it ran. Because it is
one-shot, **the flag only matters on a database that has not been seeded yet**. Turning it off later
does not delete existing demo orders, and turning it back on does not re-date them.

### With demo data (default)

```bash
cp .env.example .env                                  # once, from the repo root
docker compose up -d --build postgres auth-rbac order-management
docker compose logs order-management                  # expect "Demo orders seeded: N orders."
curl localhost:3002/health                            # direct
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

Without demo data, `npm run verify` passes **46/48**. Scenario 42 (the over-capacity peak day) and
scenario 43 (pagination over 25+ rows) need the demo orders.

### Outside Docker (local Node)

```bash
cd services/order-management && npm install && npm run build
DATABASE_URL=postgres://postgres:postgres_password@localhost:5432/delivery_db SEED_DEMO_DATA=false npm start
# or: npm run dev   (ts-node-dev, auto-restart)
```

If Postgres is also installed natively on Windows, it already owns `localhost:5432`, and a local run
connects to **it** instead of the container (symptom: `database "…" does not exist`). Stop the
native service, or run the service inside compose as shown above.

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
| Swagger UI served by this service | `http://localhost:3002/api/orders/docs` (gateway: `http://localhost/api/orders/docs`) |
| Raw spec | `http://localhost:3002/api/orders/openapi.json` |
| Platform-wide Swagger UI (all services) | `http://localhost:8080`, started with the compose `dev` profile; it reads `openapi.yaml` |

Every operation has named request-body examples, documented headers (`Authorization`,
`Idempotency-Key`, `X-Test-Now`), a success example, and one example per error code.

To try a call: log in through auth-rbac, press **Authorize**, paste the access token, pick an
example from the dropdown, then **Execute**.

The spec is code-first. `src/docs/openapi.ts` builds it from the same Zod schemas that validate
requests, and `openapi.yaml` is generated from it with `npm run openapi`. A unit test fails if a
route is added without documenting it, or if any request or response lacks an example.

## Reference data

Outlets, vehicles and holidays come from the challenge datasets in `/data`:

- `src/seed/outlets.fixture.ts` is a snapshot of `outlets.csv`.
- `src/seed/fleet.fixture.ts` is a snapshot of `vehicles.csv`.
- `src/domain/holidays.ts` lists the closed days from `calendar.csv`. That file ends on
  2026-06-28; later holidays go in `HOLIDAY_DATES`.

Snapshots are used because the Docker build context is this folder only, so the CSVs are not
reachable at runtime. `GET /summary` reads live refrigerated capacity from Fleet's `vehicles` table
when it exists in the shared database, and falls back to the snapshot otherwise.

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

Paths are shown as the frontend sees them through the gateway. Direct calls to `localhost:3002`
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

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3002` | |
| `DATABASE_URL` | `postgres://postgres:postgres_password@postgres:5432/delivery_db` | |
| `JWT_ACCESS_SECRET` | `waypoint_default_jwt_access_secret_key_2026` | must match auth-rbac |
| `ORDER_CUTOFF_HOUR` / `BUSINESS_TZ` | `16` / `Asia/Colombo` | |
| `NON_OPERATING_WEEKDAYS` / `HOLIDAY_DATES` | `0` / empty | operating calendar |
| `MAX_DEFERRALS` / `AT_RISK_DAYS` | `3` / `3` | |
| `OUTLET_SOURCE` / `FLEET_SERVICE_URL` | `local` / `http://fleet-directory:3004` | outlet directory backend |
| `SEED_DEMO_DATA` | `true` | seed demo orders once |
| `CUTOFF_JOB_INTERVAL_MS` | `60000` | cutoff timer tick |
| `CHILLED_TRIPS_PER_DAY` | `1` | chilled trips a reefer can make before the 08:00 deadline; used by `/summary` |

## Tests

```bash
npm test              # unit tests (node:test): calendar + dataset holidays, cutoff table, status machine,
                      # rollups, refs, reasons, dataset snapshots, and route-vs-OpenAPI coverage
npm run verify        # 48 endpoint scenarios against the running stack
npm run openapi       # regenerate openapi.yaml from src/docs/openapi.ts
npm run openapi:check # fail if openapi.yaml is stale
```

`verify` writes its orders onto a synthetic far-future week (unique per run), and freezes the
clock with the `X-Test-Now` header, which requires `NODE_ENV !== 'production'`. It logs in with the
seeded accounts (`Password123!`). If auth-rbac is down (see NOTES.md, known issue 1), run
`AUTH_MODE=mint npm run verify`. That signs dev tokens with the shared secret and marks scenario 2
as SKIP.

See [NOTES.md](NOTES.md) for deviations from the plan and issues found elsewhere in the repo.
