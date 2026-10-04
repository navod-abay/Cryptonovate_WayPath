# Store Manager app: backend integration guide

This app is finished on the frontend and runs on **dummy APIs**. Every network call goes through `src/api/`. Each function there either asks a fake in-memory server (`src/mock/server.ts`) or calls the real gateway. One environment variable switches between them.

This guide lists every call the app makes: the endpoint it expects, the JSON it sends and the JSON it expects back. Build (or adjust) the endpoints to match, turn the mocks off, and the screens work unchanged.

---

## 1. How to switch to the real backend

1. Copy `.env.example` to `.env.local` in `frontend/src/store_manager/`:
   ```bash
   VITE_USE_MOCK_API=false
   VITE_API_BASE_URL=http://localhost       # npm run dev against docker compose (gateway origin, no /api)
   # VITE_API_BASE_URL=                     # empty = same origin, when served behind the NGINX gateway
   ```
2. Restart `npm run dev`. Vite reads env vars only at start-up.
3. Sign in with a real store manager account, e.g. `manager_out001` / `Password123!` from `services/auth-rbac` seed data.
4. Work through the endpoint table in section 4. Anything not built yet shows a red message bottom-right (for actions) or a "We couldn't load your store data / Try again" screen (for the initial load). The app won't crash.

With `VITE_USE_MOCK_API=true` (the default), nothing touches the network and the demo accounts in `src/mock/users.ts` work.

## 2. Where things live

| File | What it does |
|---|---|
| `src/api/config.ts` | Env vars, timeouts, polling intervals |
| `src/api/http.ts` | `fetch` wrapper: base URL, `Authorization: Bearer`, `{ success, data }` unwrapping, 10 s timeout, refresh-on-401 |
| `src/api/authApi.ts` | Login, logout, change password |
| `src/api/storeManagerApi.ts` | Everything else: load data, orders, deliveries, item reports and receipt, handover code, updates |
| `src/mock/server.ts` | The fake backend: one function per endpoint, same JSON as the real one should return |
| `src/types.ts` | TypeScript types for every request and response (the contract) |
| `src/state/store.ts` | Client cache of API results; pages only read from here |

Pages never call `fetch` themselves. To change an endpoint path or reshape a response, edit only the matching function in `src/api/*.ts`. If the backend returns a different shape, map it there; pages don't change.

## 3. Conventions the frontend expects

**Gateway prefixes** (from `gateway/nginx.conf`; the prefix is stripped before reaching the service):

| Prefix | Service |
|---|---|
| `/api/auth/` | auth-rbac |
| `/api/orders/` | order-management |
| `/api/fleet/` | fleet-directory |
| `/api/execution/` | execution-sync |

**Response envelope.** Success responses can be `{ "success": true, "data": <payload> }`, as execution-sync already does; `http.ts` returns `data`. A bare payload also works. In the examples below, "Response" is the payload inside `data`.

**Errors.** Any non-2xx status counts as an error. The message shown to the user is taken from `message`, or else `error`, in the body:
```json
{ "success": false, "message": "Order window for 2026-10-05 is closed" }
```

**Auth.** Every call except login sends `Authorization: Bearer <access_token>`. On a `401`, the app calls `POST /api/auth/refresh` once with `{ "refresh_token": "..." }` and retries; if that fails it signs the user out.

**Dates and times.** All times are Sri Lanka local time (Asia/Colombo).
- `deliveryDate`, `date`: `"yyyy-mm-dd"` in **Sri Lanka local time**, not UTC. Near midnight, UTC dates fall on the wrong day.
- `eta`, `window`: `"HH:mm"` 24-hour local time, e.g. `"08:15"`.
- Timestamps (`placedAt`, `at`, `expiresAt`, …): ISO-8601, e.g. `"2026-10-04T08:15:00+05:30"`.

**IDs** are strings.

**Order categories** (`OrderType`): `"chilled" | "dry" | "tech" | "style"`. Store types (`StoreType`): `"grocery" | "tech" | "style"`. An outlet's `categories` decides which icons, order pages and menu items the app shows.

## 4. Endpoint list

Status: ✅ exists, ⚠️ exists but needs a change, 🆕 to build.

| # | Method & path (via gateway) | Status | Frontend function | Used on |
|---|---|---|---|---|
| 1 | `POST /api/auth/login` | ✅ | `authApi.login` | Login |
| 2 | `POST /api/auth/refresh` | ✅ | `http.ts` (automatic) | Any call that gets 401 |
| 3 | `GET /api/auth/me` | ⚠️ add `email`, `phone`, `memberSince` | `authApi.login` | Profile |
| 4 | `POST /api/auth/change-password` | 🆕 | `authApi.changePassword` | Profile |
| 5 | `GET /api/orders/outlets/:outletId` | 🆕 | `authApi.login` | Navbar, Home, Profile |
| 6 | `GET /api/orders/products?categories=` | 🆕 | `loadStoreData` | Place order (search, weights) |
| 7 | `GET /api/fleet/capacity?categories=` | 🆕 | `loadStoreData` | Place order (truck limits) |
| 8 | `GET /api/orders/outlets/:outletId/orders` | ⚠️ `GET /orders` is a placeholder | `loadStoreData` | Home, This Week, Order history, Order status |
| 9 | `GET /api/orders/outlets/:outletId/order-suggestions` | 🆕 | `loadStoreData` | Place order ("Last Order", missing items) |
| 10 | `POST /api/orders/outlets/:outletId/orders` | 🆕 | `placeOrder` | Place order |
| 11 | `POST /api/orders/outlets/:outletId/carry-over/dismiss` | 🆕 | `dismissMissingItem` | Place order ("No, don't add") |
| 12 | `GET /api/execution/outlets/:outletId/deliveries` | 🆕 | `loadStoreData`, `refreshLiveData` | Home, Deliveries today/past, Receive |
| 13 | `GET /api/execution/deliveries/:deliveryId` | 🆕 | `checkHandover` | Confirmation code dialog (polled) |
| 14 | `POST /api/execution/deliveries/:deliveryId/unloading` | 🆕 | `startUnloading` | Deliveries today |
| 15 | `POST /api/orders/:orderRef/receipt` | ✅ (order-management, with `lines`) | `reportIssue` (kept on device), `checkHandover`, `queueReceipt` | Receive ("What's Wrong ?", Confirm Receipt) |
| 16 | — (reports are removed on the device before the receipt is sent) | ✅ | `removeReport` | Receive (remove a report) |
| 17 | `POST /api/execution/deliveries/:deliveryId/problems` | ✅ | `reportDeliveryProblem` | Deliveries today (Report button) |
| 18 | `POST /api/execution/orders/:orderRef/confirm` | ⚠️ must return the handover code | `requestConfirmationCode` | Receive (Confirm Receipt) |
| 19 | `GET /api/notifications/outlets/:outletId/updates` + `GET /api/notifications/stream` | ✅ (notification-service) | `loadStoreData`, `refreshLiveData`, `subscribeUpdates` | Home (Recent Updates, alert counts) |
| 20 | `POST /api/notifications/read` | ✅ (notification-service) | `markUpdatesRead` | Home |

`:outletId` is the signed-in user's `outletId`. The backend should also check it matches the JWT's `outlet_id`, and return 403 if not.

Paths are suggestions that fit the current gateway. If you put an endpoint in a different service or path, change the one line in `src/api/*.ts` and update this table.

---

### 1. `POST /api/auth/login` ✅

Request:
```json
{ "username": "manager_out001", "password": "Password123!" }
```
Response (current auth-rbac shape, used as-is, no envelope needed):
```json
{
  "success": true,
  "access_token": "eyJ…",
  "refresh_token": "eyJ…",
  "user": { "id": "u1", "username": "manager_out001", "role": "store_manager", "fullName": "Tharindu Perera", "outletId": "OUT001", "depot": null }
}
```
The frontend rejects users whose `role` isn't `store_manager` or whose `outletId` is null. A `401` or `400` shows "Incorrect username or password." Afterwards it calls **#5** and **#3** with the new token.

### 2. `POST /api/auth/refresh` ✅
Request `{ "refresh_token": "…" }` → response containing `access_token` (top level or in `data`).

### 3. `GET /api/auth/me` ⚠️
Response: a `User`. Today it returns the token user. Please add the optional profile fields, or the Profile page shows "–":
```json
{ "id": "u1", "username": "manager_out001", "fullName": "Tharindu Perera", "role": "store_manager", "outletId": "OUT001",
  "email": "tharindu.p@waypoint.lk", "phone": "+94 77 123 4567", "memberSince": "2024-03-11" }
```

### 4. `POST /api/auth/change-password` 🆕
Request `{ "currentPassword": "…", "newPassword": "…" }` → `204` or `{ "success": true }`.
A wrong current password should return `400` with `message: "Current password is incorrect."`, which is shown under the form. The frontend already checks for at least 8 characters and that the new password differs from the old one.

### 5. `GET /api/orders/outlets/:outletId` 🆕
Response `Outlet`:
```json
{ "id": "OUT001", "city": "Colombo", "managerName": "Tharindu", "storeName": "Waypoint Fresh – Colombo 07",
  "storeType": "grocery", "categories": ["chilled", "dry"], "address": "42 Ward Place, Colombo 07" }
```
`managerName` is the first name used in "Good Morning, Tharindu !".

### 6. `GET /api/orders/products?categories=chilled,dry` 🆕
Response `Product[]`. Weight and volume are **per unit** (crate, tray, sack…):
```json
[ { "id": "CH-MILK", "name": "Fresh Milk Crates", "type": "chilled", "weightKg": 22, "volumeM3": 0.06 } ]
```

### 7. `GET /api/fleet/capacity?categories=chilled,dry` 🆕
Max load of the truck that carries each category. The order page won't let an order exceed it.
```json
{ "chilled": { "maxWeightKg": 800, "maxVolumeM3": 4 }, "dry": { "maxWeightKg": 2000, "maxVolumeM3": 10 } }
```
If a category is missing, the page shows totals without a limit.

### 8. `GET /api/orders/outlets/:outletId/orders` ⚠️
Response `Order[]`. Include at least the last 14 days and all future orders: the "This Week" panel and the order history use them.
```json
[{
  "id": "ORD-OUT001-C-0412", "type": "chilled", "deliveryDate": "2026-10-05",
  "status": "scheduled",
  "lines": [ { "productId": "CH-MILK", "name": "Fresh Milk Crates", "quantity": 6, "carriedOver": 1 } ],
  "placedAt": "2026-10-04T13:41:00+05:30", "scheduledAt": "2026-10-04T17:41:00+05:30",
  "loadedAt": null, "dispatchedAt": null, "receivedAt": null,
  "eta": "09:12", "vehicle": "VEH056", "deferredReason": null
}]
```
- **`status`** is one of `confirmed` (placed, not planned yet), `scheduled`, `deferred`, `loaded`, `on_the_way` or `delivered`.
- **Timestamps** fill the 5-step timeline on the order page. `deferredReason` is shown in the red "Why ?" card when the status is `deferred`.
- **`carriedOver`** is the number of units re-requested from a short delivery. It's shown as "6 + 1 missed".

### 9. `GET /api/orders/outlets/:outletId/order-suggestions` 🆕
```json
{
  "lastOrderQty": { "CH-MILK": 4, "CH-YOG": 5 },
  "missingFromLast": { "chilled": [ { "productId": "CH-CHICK", "name": "Chicken Trays", "quantity": 1 } ] }
}
```
- `lastOrderQty` fills the "Last Order" column.
- `missingFromLast` holds the units that came up short last time. Each item gets its own "Want to receive 01 missing chicken tray from last order? Yes, add / No, don't add" line.

### 10. `POST /api/orders/outlets/:outletId/orders` 🆕
Creates the order for that day and category, or **replaces** it if one exists (the edit pencil uses the same call). Request `NewOrderInput`:
```json
{ "type": "chilled", "deliveryDate": "2026-10-05",
  "lines": [ { "productId": "CH-MILK", "name": "Fresh Milk Crates", "quantity": 6 }, { "productId": "CH-CHICK", "name": "Chicken Trays", "quantity": 0, "carriedOver": 1 } ] }
```
Response: the saved `Order` (as in #8).

Server-side checks the UI already enforces (please enforce them on the server too, and return 4xx with a `message`):
- **Order window:** an order for date D closes at **4:00 PM on D−1**. Deliveries run Monday–Saturday; see `src/utils/date.ts`.
- **Truck limit:** total weight and volume ≤ the truck capacity in #7.
- **Category:** the category must be one of the outlet's `categories`.

Placing an order also clears that category's `missingFromLast` (the carried-over units are now on the order).

### 11. `POST /api/orders/outlets/:outletId/carry-over/dismiss` 🆕
Request `{ "type": "chilled", "productId": "CH-FISH" }` → `204`. The store manager said "No, don't add". The UI hides the line straight away and restores it if this fails.

### 12. `GET /api/execution/outlets/:outletId/deliveries` 🆕
Response `Delivery[]` covering today and past deliveries (the last 14 days is fine). **Polled every 60 s** while the app is open.
```json
[{
  "id": "DEL-0412", "orderId": "ORD-OUT001-C-0412", "type": "chilled", "vehicle": "VEH056",
  "date": "2026-10-04", "eta": "08:15", "window": ["08:00", "08:30"],
  "status": "arrived",
  "stops": [ { "label": "Warehouse", "done": true }, { "label": "Outlet 1", "done": true } ],
  "items": [ { "productId": "CH-CHICK", "name": "Chicken Trays", "ordered": 10, "sent": 9, "received": 9 } ],
  "reports": [],
  "arrivedAt": "2026-10-04T08:15:00+05:30", "confirmedAt": null
}]
```
- **`status`** is one of `on_the_way`, `arrived`, `unloading` or `delivered`.
- **Buttons:** Start Unloading is enabled only when the status is `arrived`, and Confirm Receipt only after it.
- **`stops`** are the stops before this outlet, shown as Warehouse ✓ → Outlet 1 ✓ → You.
- **Loader shortfalls:** `ordered − sent` is shown as "01 chicken tray was removed at loading !" under Past Data.
- **`reports`** are the store manager's item reports for this delivery (see #15); the app adds the ones still held on the device.

### 13. `GET /api/execution/deliveries/:deliveryId` 🆕
Same shape as one item of #12. Polled **every 3 s** while the confirmation code is on screen. When `status` becomes `delivered` (the driver typed the code), the dialog closes and Home shows DELIVERED.

### 14. `POST /api/execution/deliveries/:deliveryId/unloading` 🆕
No body. Moves `arrived` → `unloading`. Response: the updated `Delivery`.

### 15. `POST /api/orders/:orderRef/receipt` ✅
Item reports ("What's Wrong ?") are **kept on the device** (localStorage, per outlet) while unloading, so they can still be removed, and are sent together as one receipt to order-management once the order is `delivered` — right after the driver enters the handover code (`checkHandover`). Request:
```json
{ "received_units": 11, "missing_units": 2, "rejected_units": 1,
  "lines": [ { "sku": "CH-MILK", "kind": "missing", "quantity": 1, "reasons": ["Removed at loading"] },
             { "sku": "CH-MILK", "kind": "missing", "quantity": 1, "reasons": [] },
             { "sku": "CH-YOG",  "kind": "damaged", "quantity": 1, "reasons": ["Crushed", "Leaking"] } ] }
```
- `received + missing + rejected` must equal the order's units (the app sums `items[].ordered`); damaged counts as rejected.
- Items the loader removed (`ordered − sent`) are sent as `missing` lines with the reason "Removed at loading".
- A short receipt sets the order to `disputed` and raises a `store.discrepancy` alert for the dispatcher.
- **Network outage:** if the driver had no signal, they record the delivery offline and cannot enter the code. The code dialog offers "Send my receipt later" (`queueReceipt`); the receipt is then sent by the next poll after the driver's offline proof syncs and the delivery becomes `delivered`.
- `Delivery.reports` (#12) should list the receipt's lines once it is recorded.

### 16. Removing a report
No endpoint: reports are only on the device until the receipt is sent.

### 17. `POST /api/execution/deliveries/:deliveryId/problems` ✅
The Report button on a delivery that's still on the way. Request `{ "problems": ["Vehicle is late", "Can’t reach the driver"], "orderRef": "ORD-…" }` → `{ "id": "<uuid>" }` (201). Raises a `store.delivery_problem` alert for the dispatcher.

### 18. `POST /api/execution/orders/:orderRef/confirm` ⚠️
Store manager presses **Confirm Receipt**. The request is `{ "deliveryId": "DEL-0412" }`; the existing optional `notes` can stay. The response must be the **handover code** the manager reads to the driver:
```json
{ "deliveryId": "DEL-0412", "code": "111311", "expiresAt": "2026-10-04T08:23:52+05:30" }
```
The dialog counts down to `expiresAt` and offers "Get a new code", which calls this again. The driver app submits the code; once it matches, set the delivery to `delivered` and `confirmedAt`, and the order to `delivered` and `receivedAt`. #13 picks that up.

### 19. `GET /api/notifications/outlets/:outletId/updates` ✅
Recent Updates feed and alert counts, from notification-service. `:outletId` must match the token's `outlet_id` (403 otherwise). Polled every 60 s, and pushed live by `GET /api/notifications/stream` (Server-Sent Events, `src/api/updateStream.ts`; frames `ready` and `alerts`, reconnect with `Last-Event-ID`).
```json
[{ "id": "7f0c…", "source": "driver", "message": "Road access blocked at OUT001 (Trip 1). Driver: Took an alternative route.",
   "at": "2026-10-04T07:10:00.000Z", "link": "/deliveries/today", "read": false, "syncedLate": false }]
```
- **`source`** is `driver`, `dispatcher` or `loader`, and picks the icon and which Alerts button counts it. Today drivers' incident reports about this outlet are what arrives.
- **`at`** is when it happened; **`syncedLate`** is true when it reached the server more than 5 minutes later (sent from the driver's offline queue).
- **`read`** is per user.

### 20. `POST /api/notifications/read` ✅
Request `{ "ids": ["7f0c…"] }` → `204`. Called when the user opens an update or an Alerts filter.

---

## 5. Things to fix in the current backend

- **Outlet details:** login only returns `outletId`. #5 is needed for the store name, type, categories and city.
- **Confirm shape:** see #18.
- **Dates:** return delivery dates in Asia/Colombo local time (see section 3).
- **CORS:** when running `npm run dev` (port 5173) against the gateway (port 80), the services or NGINX must allow that origin, or leave `VITE_API_BASE_URL` empty and serve the app behind the gateway.

## 6. Checking an endpoint

1. Run the backend with `docker compose up`.
2. In `frontend/src/store_manager`, set `.env.local` to `VITE_USE_MOCK_API=false` and `VITE_API_BASE_URL=http://localhost`, then run `npm run dev`.
3. Open DevTools → Network and filter by `api`. Every request listed in section 4 shows up with its path, body and the `Authorization` header.
4. Walk through: login → Home → place an order → Deliveries → Start Unloading → report an item → Confirm Receipt (enter the code in the driver app) → Profile → change password → log out.
5. Compare any failing response with the examples above. A mismatch is fixed either on the server or in the matching function in `src/api/`.

The mock implementation of each endpoint, in `src/mock/server.ts`, is a working reference for the expected behaviour.
