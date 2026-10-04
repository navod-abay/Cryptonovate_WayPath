# Dispatcher integration for testing

Dispatcher is a standalone React app. Users sign in through auth-rbac and every API call carries the access token. There is no sample-data fallback: failed or rejected requests show an error and Retry control.

## Data flow

1. A screen asks `frontend/src/dispatcher/data/dispatcherRepository.ts` for data.
2. The HTTP helper (`data/http.ts`) calls the configured API with `Authorization: Bearer <access token>`, timing out after three seconds.
3. On a 401 it refreshes the access token once and retries.

Successful empty API responses are preserved. The app polls APIs every minute.

## Existing APIs used

Paths include the gateway `/api` prefix.

| Data | API |
| --- | --- |
| Orders (paginated) | GET `/api/orders/?from=…&to=…&page=…&page_size=200` |
| Order and ordered items | GET `/api/orders/{order_ref}` |
| Outlet districts | POST `/api/fleet/outlets/batch` with `{outlet_ids:[…]}` |
| Vehicles | GET `/api/fleet/vehicles` |
| Depot schedule and nested trips | GET `/api/planning/depots/{depot}/schedule?date=…` |
| Schedule summaries | GET `/api/planning/schedule/summary?date=…` |
| Deferred orders | GET `/api/planning/schedule/deferrals?date=…&depot=…` |
| Category totals (delivered / total per chilled, dry, tech, style) | GET `/api/orders/dispatcher/overview?date=…` |
| Ordering cutoff per delivery date | GET `/api/orders/dispatcher/windows?from=…&to=…` |

Planning currently returns stub schedules; the UI labels those responses.

## Optional mappings for future services

The repository keeps these mappings isolated so service developers can replace the URLs and response mapping when their contracts are ready. These endpoints are **not implemented yet**; until they are, those panels show an error.

| Data | Current placeholder mapping |
| --- | --- |
| Weekly statistics | GET `/api/analytics/dispatcher/statistics?date=…` |
| Demand chart | GET `/api/analytics/forecast/demand?date=…` |
| Weekly fuel usage | GET `/api/fleet/fuel-usage/weekly?date=…&depot=…` |

## Alerts (implemented)

The Alerts panel reads notification-service: GET `/api/notifications/alerts?limit=50` and GET `/api/notifications/alerts/{id}`, plus live updates from GET `/api/notifications/stream` (Server-Sent Events, see `data/alertStream.ts`). Alerts come from driver incidents, offline deliveries synced from the driver app, store receipt discrepancies and store delivery problems. One that reached the server long after it happened (queued during an outage) shows "synced … ago".

Frontend interfaces for these shapes live next to the repository.

## Configuration and verification

Run `npm ci` then `npm run dev` from `frontend/src/dispatcher`, and open http://127.0.0.1:5173/dispatcher.

- Local Vite proxies match the existing service ports 5001–5007.
- `VITE_API_BASE_URL` selects a gateway origin; leave empty for local proxy.
- `npm test` checks API calls, token handling and refresh, error surfacing and cancellation.
- `npm run build` validates TypeScript and builds the app.

## Login call

`POST /api/auth/login` with `{username,password}` as JSON (seeded dispatcher: `dispatcher_admin` / `Password123!`). Success opens `/dispatcher`; errors stay on the form. The access and refresh tokens are kept in memory only, sent as `Authorization: Bearer` on every API call, and the access token is refreshed once when a call returns 401. Sign-out or a full reload clears them.

The login UI lives at `/login`, also opened by `/`. It has username/password fields and a show/hide-password control. The dev proxy forwards Auth to port 5001.

## Proposed vehicle availability call (frontend only)

`PUT /api/fleet/vehicles/{vehicle_id}/availability`

```json
{
  "status": "available",
  "unavailable_periods": [
    { "from": "2026-10-07", "to": "2026-10-09" },
    { "from": "2026-10-12", "to": "2026-10-12" }
  ]
}
```

Dates are ISO dates in Asia/Colombo, inclusive at both ends. `status` is the baseline status **outside** these periods. The UI writes baseline `available` and calendar exceptions; clear all exceptions to mark the vehicle available. It merges overlapping or adjacent ranges before sending. The service may return the saved object or an ordinary success response; list refetch follows a successful save.

The existing Fleet status PATCH only stores immediate `available`/`in_workshop`; it does not implement dated availability. The PUT above is a proposed frontend mapping for the service developer to implement or rename. No existing backend route was modified.

`GET /api/fleet/vehicles` should include optional `unavailable_periods:[{from,to}]` alongside the existing status. The frontend derives today's status and an active end date. Failed or rejected saves are shown as errors.

## Capacity and remaining weekly fuel

Existing `/api/fleet/vehicles` fields map to vehicle details:

| API field | Detail |
| --- | --- |
| `weight_cap_kg` | Weight capacity, kg |
| `volume_cap_m3` | Volume capacity, m³ |
| `weekly_fuel_quota_l` | Weekly fuel quota, L |

The proposed `GET /api/fleet/fuel-usage/weekly?date=YYYY-MM-DD&depot=Peliyagoda` response should include:

```json
{
  "success": true,
  "data": {
    "utilization": 0.1,
    "vehicles": [
      { "vehicle_id": "VEH001", "quota_litres": 100, "consumed_litres": 10 }
    ]
  }
}
```

The detail view selects its vehicle row and displays `max(0, quota_litres - consumed_litres)` as remaining quota. This endpoint remains frontend-only until the Fleet developer implements it. Fixture data supplies capacity/fuel values meanwhile.
