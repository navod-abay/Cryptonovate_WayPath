# Order Management Service (port 3002)

Owns **what needs to go where, and by when**: store orders, their line items, the 16:00 Asia/Colombo
ordering cutoff, the status lifecycle, deferrals with reasons, receipts, and an append-only audit trail.
It does not pick vehicles (Planning & Allocation), sequence stops, or capture proof of delivery (Execution & Sync).

Stack: Node 20, TypeScript (strict, NodeNext), Express 4, `pg` (raw SQL), Zod, `jsonwebtoken`.

## Run

```bash
cp .env.example .env                 # once, from the repo root
docker compose up --build order-management auth-rbac postgres
curl localhost:3002/health           # direct
curl localhost/api/orders/health     # through the gateway
```

Boot order: connect → assert schema → seed outlets + demo orders (idempotent) → listen → start the cutoff timer.

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
| `REEFER_VEHICLE_COUNT` / `REEFER_VOLUME_M3` / `CHILLED_TRIPS_PER_DAY` | `16` / `8` / `1` | `/summary` capacity reference |

## Tests

```bash
npm test          # unit tests (node:test): calendar, cutoff table, status machine, rollups, refs, reasons
npm run verify    # 45 endpoint scenarios against the running stack
```

`verify` writes its orders onto a synthetic far-future week (unique per run), and freezes the
clock with the `X-Test-Now` header, which requires `NODE_ENV !== 'production'`. It logs in with the
seeded accounts (`Password123!`). If auth-rbac is down (see NOTES.md, known issue 1), run
`AUTH_MODE=mint npm run verify`. That signs dev tokens with the shared secret and marks scenario 2
as SKIP.

See [NOTES.md](NOTES.md) for deviations from the plan and issues found elsewhere in the repo.
