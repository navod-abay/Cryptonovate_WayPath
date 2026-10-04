# Order Management — API Reference

What every endpoint does, why it is designed that way, what it returns, and every error it can raise.
Examples are captured from a running instance.

- [Conventions](#conventions)
- [Order lifecycle](#order-lifecycle)
- [Error catalogue](#error-catalogue)
- Endpoints:
  [health](#get-health) ·
  [create](#post--create-a-draft) ·
  [replace items](#put-order_refitems--replace-the-basket) ·
  [confirm](#post-order_refconfirm) ·
  [cancel](#delete-order_ref--cancel) ·
  [list](#get---list-orders) ·
  [get](#get-order_ref) ·
  [history](#get-order_refhistory) ·
  [confirmed (Planning)](#get-confirmed--the-planning-contract) ·
  [status-batch](#patch-status-batch--planning-write-back) ·
  [status](#patch-order_refstatus) ·
  [defer](#post-order_refdefer) ·
  [at-risk](#get-at-risk) ·
  [summary](#get-summary) ·
  [receipt](#post-order_refreceipt) ·
  [close-window](#post-close-window--cutoff-sweep)

---

## Conventions

**Base path.** Through the gateway: `http://localhost/api/orders/...`. Direct: `http://localhost:5002/api/orders/...`
or `http://localhost:5002/...`. The same router is mounted at both paths because nginx strips the
`/api/orders/` prefix. The list endpoint needs a trailing slash through the gateway (`/api/orders/`).

**Swagger UI.** Interactive docs at `http://localhost:5002/api/orders/docs` (gateway: `http://localhost/api/orders/docs`);
raw OpenAPI 3 JSON at `/api/orders/openapi.json`. Use **Authorize** with an access token.

**Auth.** Every route except `/health` needs `Authorization: Bearer <access_token>` from auth-rbac
(`POST /api/auth/login` with `{username, password}`). Tokens are verified statelessly with the shared
`JWT_ACCESS_SECRET`, and Order Management never calls auth-rbac. The token carries `sub, username,
role, outlet_id, depot`.

**Outlet scoping.** A `store_manager` can only see and act on the outlet in their token. Sending a
different `outlet_id` is **rejected** with 403 rather than silently rewritten, so client bugs surface
instead of placing orders in the wrong store. Dispatchers and loaders are not outlet-scoped.

**Envelope.** Every response has one of these two shapes:

```jsonc
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "CUTOFF_PASSED", "message": "human readable", "details": { ... } } }
```

`details` is present only when it adds information: a field list, `next_available_date`, and so on.
Stack traces are never returned; they are logged server-side with `order_ref` and `code`.

**Types.**

| Kind | Format | Example |
|---|---|---|
| Business day (`order_date`, …) | `YYYY-MM-DD` | `2026-09-29` |
| Delivery window | `HH:mm` wall-clock, Asia/Colombo | `04:30` |
| Instant (`placed_at`, `occurred_at`, …) | ISO 8601 UTC | `2026-09-27T18:02:44.892Z` |
| Weight / volume | number, kg 2 dp / m³ 3 dp | `123.6`, `0.132` |

All business-day logic (today, cutoff, next operating day) runs in **Asia/Colombo**, and Sunday is
not an operating day. Unknown body fields and unknown query parameters are ignored.

**Order reference.** `ORD-YYYYMMDD-NNNNN`. The date part is the order's date at creation, and the
suffix comes from a database sequence, which keeps it race-safe. The ref never changes, even if the
delivery date later moves.

**Test clock (non-production only).** Send `X-Test-Now: 2026-10-03T15:00:00+05:30` to evaluate a
request as if it were that moment. The offset is mandatory. The header is ignored when
`NODE_ENV=production`. This is how the cutoff rules are tested deterministically.

---

## Order lifecycle

```
draft ──┬─→ confirmed ──┬─→ allocated → loaded → out_for_delivery → delivered ──┬─→ received
        │               │                                                       └─→ disputed
        └─→ cancelled   ├─→ deferred ──┬─→ confirmed   (automatically, next operating day)
                        │              └─→ not_run     (after MAX_DEFERRALS, reason AGED_OUT)
                        └─→ cancelled
```

| Who moves it | Transition |
|---|---|
| Store manager / dispatcher | create (`→ draft`), confirm, cancel, edit items |
| Planning (dispatcher token) | `allocated`, `loaded`, `out_for_delivery`, `delivered`, `deferred` via status-batch |
| Store manager | `received` / `disputed`, via the receipt endpoint only |
| System | `deferred → confirmed`, `deferred → not_run` |

**Every** transition writes one row to the append-only `order_status_events` table, in the same
database transaction as the status change. A status change without an audit row is impossible.

---

## Error catalogue

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body, query or header failed validation, or the JSON is malformed. `details` = `[{field, message}]` |
| `UNAUTHORIZED` | 401 | No `Authorization: Bearer` header |
| `INVALID_TOKEN` | 401 | Bad signature, expired, or malformed token |
| `INVALID_TOKEN_TYPE` | 401 | A refresh token was used as an access token |
| `FORBIDDEN` | 403 | Your role may not call this route |
| `OUTLET_SCOPE_VIOLATION` | 403 | Store manager touching another outlet |
| `ORDER_NOT_FOUND` | 404 | Unknown `order_ref` |
| `OUTLET_NOT_FOUND` | 404 | Unknown `outlet_id` |
| `NOT_FOUND` | 404 | No such route |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 1 MB |
| `CUTOFF_PASSED` | 409 | The 16:00 cutoff for that delivery date has passed. `details.next_available_date` |
| `DUPLICATE_ORDER` | 409 | Outlet already has an active order for that date and temperature. `details.existing_order_ref` |
| `INVALID_STATE_TRANSITION` | 409 (422 inside a batch) | Transition not allowed. `details.from`, `details.to`, `details.allowed[]` |
| `ORDER_NOT_EDITABLE` | 409 | Basket locked: past cutoff or past `confirmed` |
| `ORDER_NOT_CANCELLABLE` | 409 | Cancel attempted at or after `allocated` |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Key reused with a different body |
| `RECEIPT_ALREADY_RECORDED` | 409 | Second receipt for the same order |
| `EMPTY_ORDER` | 422 | Confirm with no items, or emptying a confirmed order |
| `CHILLED_MISMATCH` | 422 | Item `is_chilled` disagrees with the order's temperature, or a chilled order for a non-Fresh outlet |
| `DEFERRAL_REASON_REQUIRED` | 422 | Missing or unknown `reason_code`, or `DISPATCHER_OVERRIDE` without a note |
| `NON_OPERATING_DATE` | 422 | Date is a Sunday or holiday. `details.next_operating_day` |
| `RECEIPT_UNITS_MISMATCH` | 422 | received + missing + rejected ≠ ordered units |
| `DB_UNAVAILABLE` | 503 | Database unreachable; retry |
| `INTERNAL_SERVER_ERROR` | 500 | Anything unexpected. Logged, never leaked |

Every authenticated route can also return `UNAUTHORIZED`, `INVALID_TOKEN`, `FORBIDDEN` and
`DB_UNAVAILABLE`. The per-endpoint tables below list only the errors specific to that endpoint.

---

## `GET /health`

**Public.** Liveness and readiness in one check: it pings the database.

`reference_data.outlets` shows when outlets were last copied from Fleet & Directory's `outlets`
table, how many were copied, how many rows were skipped as invalid, and the last sync error, if any.

**Why:** compose, the gateway and the judges need an honest signal. A service that is up but can't
reach its DB is not healthy, so this returns **503** in that case rather than a misleading 200.

```jsonc
// 200
{ "service": "order-management", "status": "healthy", "db": "up",
  "reference_data": { "outlets": { "source": "database: outlets (Fleet & Directory)", "last_synced_at": "2026-09-27T18:05:02.118Z",
                                  "outlets": 120, "skipped_invalid": 0, "last_error": null } },
  "timestamp": "2026-09-27T18:07:31.046Z" }
// 503
{ "service": "order-management", "status": "degraded", "db": "down", "timestamp": "..." }
```

---

## `POST /` — create a draft

**Roles:** store_manager (own outlet), dispatcher (any outlet).
**Header (optional):** `Idempotency-Key: <1–100 printable chars>`.

```jsonc
{
  "outlet_id": "OUT001",          // store_manager: omit (taken from token); dispatcher: required
  "temp_requirement": "chilled",  // "ambient" | "chilled"
  "order_date": "2026-09-29",     // optional. Omit = "next available run", fixed at confirm time
  "items": [                      // optional, 0–500 lines, unique sku per order
    { "sku": "MLK-1L", "description": "Fresh milk 1L", "quantity": 120,
      "unit_weight_kg": 1.03, "unit_volume_m3": 0.0011, "is_chilled": true }
  ]
}
```

**Logic, in order:**
1. **Idempotency.** If the key was seen before with an identical body, return the original order
   (**200**, `"idempotent_replay": true`). A different body returns `IDEMPOTENCY_KEY_CONFLICT`. The
   comparison uses a stored sha256 fingerprint of the canonical payload, so client retries never
   create duplicates.
2. **Scope and lookup.** The outlet must exist and be in the caller's scope. An outlet not yet in
   `outlets_ref` is looked up in Fleet & Directory's `outlets` table and copied across first.
3. **Temperature rules.**
   - Chilled orders are Fresh-only.
   - Every item's `is_chilled` must match `temp_requirement`. The order's temperature is never
     auto-flipped: the business model is two separate orders (one ambient, one chilled) per day.
4. **Date rules (explicit `order_date` only).** The date must be an operating day, and its cutoff
   must not have passed.
5. **Snapshot.** `brand`, `depot` and the outlet's delivery window are copied onto the order, so
   later outlet edits never rewrite an open order.
6. **Write, in one transaction.**
   - Duplicate check on (outlet, date, temperature).
   - Insert the order and its items.
   - Recompute the totals in SQL from the items (Σqty, Σqty×weight, Σqty×volume).
   - Write a `null → draft` event.

**201** returns the full order (the same shape as [GET /:order_ref](#get-order_ref)).

| Error | When |
|---|---|
| 400 `VALIDATION_ERROR` | bad field or type, duplicate sku, bad Idempotency-Key, malformed JSON |
| 403 `OUTLET_SCOPE_VIOLATION` | store_manager sends another outlet's id |
| 404 `OUTLET_NOT_FOUND` | unknown outlet: not in `outlets_ref`, and not in Fleet & Directory's `outlets` table either |
| 422 `CHILLED_MISMATCH` | item temperature mismatch, or chilled order for Style/Tech |
| 422 `NON_OPERATING_DATE` | `order_date` is a Sunday or holiday |
| 409 `CUTOFF_PASSED` | explicit `order_date` is already closed |
| 409 `DUPLICATE_ORDER` | active order already exists (`details.existing_order_ref`) |
| 409 `IDEMPOTENCY_KEY_CONFLICT` | key reused with a different body |

---

## `PUT /:order_ref/items` — replace the basket

**Roles:** store_manager (own outlet), dispatcher. **Body:** `{ "items": [ ... ] }`, which is a
**full replacement**, not a patch.

**Why a full replacement:** the client always holds the whole basket, and a replace is naturally
idempotent. Retrying the same PUT gives the same result.

**Logic:**
- Lock the order row.
- Editable only while `draft`, or while `confirmed` **and** its delivery date's cutoff hasn't passed.
  After the cutoff, Planning may already be working from it.
- A confirmed order can't be emptied: cancel it instead.
- Delete the items, insert the new ones and recompute the totals, all in one transaction.

**200** returns the full order.

| Error | When |
|---|---|
| 404 `ORDER_NOT_FOUND` / 403 `OUTLET_SCOPE_VIOLATION` | |
| 409 `ORDER_NOT_EDITABLE` | past cutoff, or status beyond `confirmed` |
| 422 `EMPTY_ORDER` | empty basket on a confirmed order |
| 422 `CHILLED_MISMATCH` | item temperature mismatch |

---

## `POST /:order_ref/confirm`

**Roles:** store_manager (own outlet), dispatcher. **Body (optional):** `{ "accept_next_run": true }`.

**Why:** the booklet says orders after 16:00 "wait for the following run". Moving the date silently
would surprise the store, so the service refuses and makes the caller explicitly accept the later
run.

**Logic:**
1. Must be `draft` and have at least one item.
2. Pick the target date:
   - A requested date, or else the next operating day.
   - If that date is still open, confirm for it.
   - If its cutoff has passed, return **409 `CUTOFF_PASSED`**, unless `accept_next_run` is set, in
     which case confirm for the earliest open run.
3. Set `status=confirmed`, `order_date`, `original_order_date` (the fairness baseline, which never
   changes again), `confirmed_at` and `cutoff_applied_at`. Write a `draft → confirmed` event.

| Confirmed at (Colombo) | Result |
|---|---|
| Mon 15:59:59 | Tue |
| Mon 16:00:00 | 409, or Wed with `accept_next_run` |
| Fri 15:00 | Sat |
| Fri 17:00 | 409, or Mon with `accept_next_run` (Sunday skipped) |
| Sat 15:00 | Mon |
| Sat 17:00 | 409, or Tue with `accept_next_run` |

**200** returns the full order plus `"rolled_to_next_run": true|false`.

| Error | When |
|---|---|
| 409 `INVALID_STATE_TRANSITION` | not a draft |
| 422 `EMPTY_ORDER` | no items |
| 409 `CUTOFF_PASSED` | `details: { requested_date, next_available_date }` |
| 409 `DUPLICATE_ORDER` | the resolved date collides with another active order |
| 422 `NON_OPERATING_DATE` | the date became a holiday after creation |

---

## `DELETE /:order_ref` — cancel

**Roles:** store_manager (own outlet), dispatcher. **Body (optional):** `{ "reason_note": "..." }`.

**Soft delete only.** The row becomes `cancelled` and is never removed, because the audit trail must
survive. Allowed only from `draft` or `confirmed`. Once allocated, pulling an order changes a
vehicle plan, which is Planning's decision. A cancelled order frees its (outlet, date, temperature)
slot, so it can be re-ordered.

**200** returns the full order with `status: "cancelled"`.

| Error | When |
|---|---|
| 409 `ORDER_NOT_CANCELLABLE` | status is `allocated` or later. `details.cancellable_from` |

---

## `GET /` — list orders

**Roles:** store_manager (forced to own outlet), dispatcher, loader.

| Query | Notes |
|---|---|
| `outlet_id`, `depot`, `brand`, `temp_requirement` | exact match |
| `status` | repeatable (`?status=a&status=b`) or comma-separated |
| `from`, `to` | inclusive range on `order_date`; `from ≤ to` |
| `page` (default 1), `page_size` (default 50, max 200) | |

Sorted `order_date DESC, order_ref ASC`. The sort is total, so pages never overlap or skip rows.
**Items are not included**, to keep the payload small; fetch one order for its items.

```jsonc
{ "success": true, "data": { "orders": [ /* order rows, no items/events */ ], "page": 1, "page_size": 50, "total": 1706 } }
```

| Error | When |
|---|---|
| 400 `VALIDATION_ERROR` | bad enum, date, page size, or `from > to` |
| 403 `OUTLET_SCOPE_VIOLATION` | store_manager filters on another outlet |

---

## `GET /:order_ref`

**Roles:** store_manager (own outlet), dispatcher, loader. Returns the order, its items, and the
**latest 20** status events (oldest first).

```jsonc
{
  "success": true,
  "data": {
    "order_ref": "ORD-26560606-01703", "outlet_id": "OUT001", "brand": "Fresh", "depot": "Peliyagoda",
    "order_date": "2656-06-06", "original_order_date": "2656-06-06", "requested_order_date": "2656-06-06",
    "temp_requirement": "chilled", "status": "disputed",
    "order_units": 120, "order_weight_kg": 123.6, "order_volume_m3": 0.132,
    "window_open_time": "05:00", "window_close_time": "07:30",
    "placed_by": "9595b3cf-…", "placed_by_username": "manager_out001",
    "placed_at": "…Z", "confirmed_at": "…Z", "cutoff_applied_at": "…Z",
    "deferral_count": 0, "vehicle_id": "VEH001", "trip_id": 1, "idempotency_key": null,
    "created_at": "…Z", "updated_at": "…Z",
    "items": [ { "id": "…", "order_ref": "…", "sku": "MLK-1L", "description": "Fresh milk 1L", "quantity": 120,
                 "unit_weight_kg": 1.03, "unit_volume_m3": 0.0011, "is_chilled": true, "created_at": "…Z" } ],
    "events": [ { "id": "…", "order_ref": "…", "from_status": "delivered", "to_status": "disputed",
                  "reason_code": null, "reason_note": "2 crates short", "actor_id": "…",
                  "actor_role": "store_manager", "occurred_at": "…Z" } ]
  }
}
```

| Error | When |
|---|---|
| 404 `ORDER_NOT_FOUND` / 403 `OUTLET_SCOPE_VIOLATION` | |

---

## `GET /:order_ref/history`

**Roles:** store_manager (own outlet), dispatcher. The **complete** append-only trail, oldest first,
with a human-readable `reason_label` added to each coded reason.

**Why:** this answers the booklet's "deferrals lack a clear record". It shows who pushed an order
back, why, how many times, and when it aged out.

```jsonc
{
  "success": true,
  "data": {
    "order_ref": "ORD-20260921-01373", "outlet_id": "OUT045", "status": "not_run",
    "order_date": "2026-09-24", "original_order_date": "2026-09-21", "deferral_count": 3,
    "events": [
      { "from_status": "confirmed", "to_status": "deferred", "reason_code": "CAPACITY_WEIGHT",
        "reason_label": "Vehicle weight limits exhausted", "reason_note": null,
        "actor_id": null, "actor_role": "dispatcher", "occurred_at": "2026-09-19T12:50:00.000Z" },
      { "from_status": "deferred", "to_status": "confirmed", "reason_code": null, "reason_label": null,
        "reason_note": "Returned to the confirmed pool for 2026-09-22 (deferral 1 of 3)",
        "actor_id": null, "actor_role": "system", "occurred_at": "2026-09-19T12:50:01.200Z" }
      // … through to deferred → not_run with reason_code AGED_OUT
    ]
  }
}
```

---

## `GET /confirmed` — the Planning contract

**Roles:** dispatcher, loader. **Query:** `date` (required), `depot` (optional).

The confirmed pool for one delivery date. This is what Planning & Allocation reads to build routes.
**Its shape is a contract, so do not change it without telling Planning.**

**Design:**
- Outlet access fields (`district`, `dock_type`, `parking_constraint`, `mall_window`) and fairness
  counters are **joined onto each row**. Planning can then check feasibility (van-only, mall windows,
  reefer need) without a second call per outlet, the same way the challenge's peak-day CSV flattens
  them.
- Rows are sorted **most-deferred first, then longest-unserved**, which is the order Planning should
  consider them in.
- `totals` equal the sum of the rows.

```jsonc
{
  "success": true,
  "data": {
    "date": "2026-09-28", "depot": "Peliyagoda",
    "totals": { "orders": 157, "units": 48338, "weight_kg": 119572.25, "volume_m3": 343.884,
                "chilled_orders": 66, "chilled_volume_m3": 179.639 },
    "orders": [
      { "order_ref": "ORD-20260925-01374", "outlet_id": "OUT045", "brand": "Fresh", "depot": "Peliyagoda",
        "district": "Kalutara", "temp_requirement": "ambient",
        "order_units": 42, "order_weight_kg": 282.5, "order_volume_m3": 1.091,
        "window_open_time": "04:45", "window_close_time": "07:45",
        "dock_type": "rear_dock", "parking_constraint": "normal", "mall_window": false,
        "deferral_count": 2, "deferred_yesterday": true, "days_since_last_served": 9,
        "original_order_date": "2026-09-25" }
    ]
  }
}
```

| Error | When |
|---|---|
| 400 `VALIDATION_ERROR` | `date` missing or invalid, bad `depot` |

---

## `PATCH /status-batch` — Planning write-back

**Role:** dispatcher (Planning calls this with a dispatcher token for now).

```jsonc
{ "updates": [
  { "order_ref": "ORD-20260929-00042", "status": "allocated", "vehicle_id": "VEH001", "trip_id": 1 },
  { "order_ref": "ORD-20260929-00043", "status": "deferred",
    "reason_code": "NO_REEFER_AVAILABLE", "reason_note": "all 9 Peliyagoda reefers committed to trip 1" }
] }
```

**Design: all-or-nothing.** A half-applied allocation is worse than a rejected one, because the
dispatcher must be able to trust the board.
- Every entry is tried in one transaction, each under a savepoint, so **every** failure is reported,
  not just the first.
- If any entry fails, the whole batch rolls back.
- Entries run in order, so one batch can move an order through several steps
  (`allocated → loaded → …`).

**Rules per entry:**
- `allocated` needs `vehicle_id` and `trip_id` ∈ {1, 2}.
- `deferred` runs the full [deferral sequence](#post-order_refdefer).
- `received`, `disputed`, `not_run` and `draft` can't be set here; they belong to the receipt
  endpoint, the system, or create.
- Any other target must be a legal transition.

Limits: 1–500 updates.

```jsonc
// 200
{ "success": true, "data": { "updated": 2, "orders": [ /* the affected order rows */ ] } }

// 422 — nothing applied
{ "success": false, "error": {
    "code": "ORDER_NOT_FOUND",                       // = the first failure's code
    "message": "1 of 2 update(s) rejected; no changes were applied",
    "details": { "failures": [
      { "index": 1, "order_ref": "ORD-00000000-99999", "code": "ORDER_NOT_FOUND",
        "message": "Order ORD-00000000-99999 does not exist", "details": { "order_ref": "…" } } ] } } }
```

Possible codes per failure: `ORDER_NOT_FOUND`, `INVALID_STATE_TRANSITION` (with `allowed[]`),
`VALIDATION_ERROR` (vehicle/trip), `DEFERRAL_REASON_REQUIRED`. A structurally invalid body (not an
array, over 500 entries, unknown status value) returns **400 `VALIDATION_ERROR`** before anything
runs.

---

## `PATCH /:order_ref/status`

**Roles:** loader, driver, dispatcher. **Body:** `{ "status": "...", "vehicle_id"?, "trip_id"?, "reason_code"?, "reason_note"? }`.

A single-order status change for the dock and the road. It exists for Execution & Sync, which
reports one stop at a time. It runs the same code path as one `status-batch` entry, so the state
machine and audit trail are identical.

**Who may set what:**

| Role | Statuses |
|---|---|
| loader | `loaded` |
| driver | `out_for_delivery`, `delivered` |
| dispatcher | anything `status-batch` allows |

The role limit keeps the audit trail honest: each event records the role that physically did the
step. `received` and `disputed` are never set here, only through the
[receipt](#post-order_refreceipt) endpoint, because they need unit counts.

```jsonc
// driver
{ "status": "delivered", "reason_note": "POD signed 06:42" }
```

**200** returns the full order.

| Error | When |
|---|---|
| 400 `VALIDATION_ERROR` | unknown `status`, or `allocated` without `vehicle_id` / `trip_id` ∈ {1,2} |
| 403 `FORBIDDEN` | the role may not set that status. `details.permitted` |
| 404 `ORDER_NOT_FOUND` | |
| 409 `INVALID_STATE_TRANSITION` | not a legal next step, or a receipt-only/system status. `details.allowed[]` |
| 422 `DEFERRAL_REASON_REQUIRED` | `deferred` without a valid reason |

**Note for Execution & Sync:** calls must carry `Authorization: Bearer <token>` (the driver's or
loader's own token). Store confirmation and disputes map to `POST /:order_ref/receipt`, not to a
`confirmed` / `disputed` status here. In this service `confirmed` means "accepted into the
delivery pool".

---

## `POST /:order_ref/defer`

**Role:** dispatcher. **Body:** `{ "reason_code": "CAPACITY_WEIGHT", "reason_note": "optional" }`.
This is the single-order version of a `deferred` entry in status-batch, and uses the same code path.

**Why coded reasons:** free text can't be reported on. Every deferral must carry one of:

| Code | Meaning |
|---|---|
| `CAPACITY_WEIGHT` / `CAPACITY_VOLUME` | vehicle limits exhausted |
| `NO_REEFER_AVAILABLE` | chilled order, no refrigerated vehicle free |
| `NO_VAN_FOR_VAN_ONLY_OUTLET` | van-only outlet, no van |
| `WINDOW_INFEASIBLE` | cannot reach the outlet inside its window |
| `TIME_BUDGET_EXCEEDED` | route time budget exhausted |
| `FUEL_QUOTA_EXCEEDED` | weekly fuel quota would be breached |
| `VEHICLE_UNAVAILABLE` | vehicle in workshop |
| `LOWER_PRIORITY` | deprioritised |
| `DISPATCHER_OVERRIDE` | manual decision; **`reason_note` required** |
| `AGED_OUT` | system only; callers cannot send it |

**Sequence (one transaction):**
1. The order must be `confirmed`, and the reason must be valid.
2. `deferral_count += 1`. `order_date` moves to the next operating day. `original_order_date` is
   **never** touched. Any vehicle and trip are cleared.
3. Write the event `confirmed → deferred`, recording the reason and the actor.
4. Set the outlet's `deferred_yesterday = true`.
5. If `deferral_count` has reached `MAX_DEFERRALS` (default 3): write `deferred → not_run` with
   `AGED_OUT`, and the order stops recycling.
6. Otherwise: write `deferred → confirmed` (actor `system`), and the order is back in the pool for
   the new date automatically.

A deferred order may sit alongside that outlet's own order for the new date. The uniqueness rule
exempts carried-over orders, because Fresh outlets order daily.

**200** returns the full order (status `confirmed`, or `not_run` if it aged out).

| Error | When |
|---|---|
| 409 `INVALID_STATE_TRANSITION` | order is not `confirmed` |
| 422 `DEFERRAL_REASON_REQUIRED` | missing or unknown code, `AGED_OUT` sent by the caller, or override without a note |

---

## `GET /at-risk`

**Role:** dispatcher. **Query:** `depot`, `min_deferrals` (default 2), `min_days` (default `AT_RISK_DAYS`=3).

Outlets in danger of being skipped again. This is the direct answer to "the same outlet unserved on
consecutive runs". An outlet is listed if **any** of these hold:

| Flag | Condition |
|---|---|
| `CONSECUTIVE_DEFERRAL_RISK` | deferred on the last run, **or** an order deferred ≥ `min_deferrals` times |
| `STALE_SERVICE` | `days_since_last_served ≥ min_days` **and** it has an open order already past its original date |
| `AGED_OUT_RECENTLY` | an order went `not_run` in the last 14 days |

`STALE_SERVICE` requires overdue demand. Without that condition, weekly-cadence Style outlets that
simply haven't ordered would flood the list. Results are sorted by worst first.

```jsonc
{ "success": true, "data": {
  "criteria": { "min_deferrals": 2, "min_days": 3, "depot": "Peliyagoda" },
  "outlets": [ { "outlet_id": "OUT045", "brand": "Fresh", "district": "Kalutara", "depot": "Peliyagoda",
    "deferred_yesterday": true, "days_since_last_served": 9, "last_served_date": "2026-09-18",
    "max_deferral_count": 3, "open_orders": 3, "overdue_open_orders": 1, "aged_out_orders": 1,
    "flags": ["CONSECUTIVE_DEFERRAL_RISK", "STALE_SERVICE", "AGED_OUT_RECENTLY"] } ] } }
```

---

## `GET /summary`

**Role:** dispatcher. **Query:** `date` (default: next operating day), `depot`.

Dispatcher dashboard for one date:
- counts by status;
- units, weight and volume by brand and by temperature (cancelled and not_run excluded);
- a **chilled-capacity check** against the refrigerated fleet.

Chilled capacity is the tightest constraint in the business (16 of 60 vehicles), so the summary
shows at a glance whether deferrals are unavoidable that day.

Capacity = total volume of the **available** refrigerated vehicles (for the depot, if given) ×
`CHILLED_TRIPS_PER_DAY` (default 1, because chilled goods must arrive before 08:00).

The vehicles come from Fleet & Directory's API (`GET /api/fleet/vehicles?status=available`), so a
reefer in the workshop is excluded. The result is cached for 30 seconds.

If Fleet cannot be reached, nothing is estimated: `available` is `false`, and `reefer_vehicles`,
`reefer_volume_m3`, `capacity_m3`, `utilisation_pct` and `exceeds_capacity` are `null`. The rest of
the summary is unaffected.

```jsonc
{ "success": true, "data": {
  "date": "2026-10-03", "depot": "Peliyagoda",
  "by_status": { "confirmed": 119 },
  "by_brand": { "Fresh": { "orders": 97, … }, "Style": { … }, "Tech": { … } },
  "by_temperature": { "ambient": { … }, "chilled": { "orders": 48, … , "volume_m3": 291.664 } },
  "chilled_capacity_reference": { "available": true, "note": "…", "reefer_vehicles": 9,
    "reefer_volume_m3": 207.5, "chilled_trips_per_day": 1, "capacity_m3": 207.5, "demand_m3": 291.664,
    "utilisation_pct": 140.6, "exceeds_capacity": true } } }
```

---

## `POST /:order_ref/receipt`

**Role:** store_manager (own outlet), called from the store counter screen or by Execution & Sync.

```jsonc
{ "received_units": 118, "missing_units": 2, "rejected_units": 0, "note": "2 crates short" }
```

**Logic:**
- The order must be `delivered`, and each order gets only one receipt.
- `received + missing + rejected` must equal `order_units`, so every unit is accounted for.
- All units received → `received`. Any missing or rejected → `disputed`.
- Either way, the outlet counts as **served**: `days_since_last_served = 0`, `last_served_date`
  updated, `deferred_yesterday = false`. A short delivery was still a visit.

**200:**

```jsonc
{ "success": true, "data": { "order": { /* full order, status received|disputed */ },
  "receipt": { "id": "…", "order_ref": "…", "received_units": 118, "missing_units": 2, "rejected_units": 0,
               "note": "2 crates short", "received_by": "…", "received_at": "…Z" } } }
```

| Error | When |
|---|---|
| 409 `INVALID_STATE_TRANSITION` | order is not `delivered` |
| 409 `RECEIPT_ALREADY_RECORDED` | second receipt |
| 422 `RECEIPT_UNITS_MISMATCH` | units don't add up. `details` shows the numbers |

---

## `POST /close-window` — cutoff sweep

**Role:** dispatcher. **Body:** `{ "date": "YYYY-MM-DD" }` (default: next operating day).

This is the same routine the timer runs automatically after 16:00 Colombo on every operating day. It
exists so the cutoff can be demonstrated without waiting for 16:00.

**Sweep (one transaction, idempotent per date):**
1. Insert a `service_jobs('cutoff_sweep', date)` guard row. If it already exists, return the stored
   result without doing anything.
2. Move any `deferred` orders for `date` back to `confirmed`, with an event for each.
3. Add 1 to `days_since_last_served` for every outlet **not** served on the previous operating day.
4. Clear `deferred_yesterday` for outlets that **were** served.
5. Store the counts in `service_jobs.result`.

The guard row makes the sweep safe across restarts and multiple replicas.

```jsonc
{ "success": true, "data": {
  "job_name": "cutoff_sweep", "job_key": "2026-09-29", "already_ran": false, "ran_at": "…Z",
  "result": { "closing_date": "2026-09-29", "service_day": "2026-09-28", "deferred_swept_to_confirmed": 0,
              "swept_order_refs": [], "outlets_days_since_served_incremented": 117,
              "outlets_deferred_flag_cleared": 2, "trigger": "manual" } } }
```

A repeat call for the same date returns `already_ran: true` and the identical `result`.
