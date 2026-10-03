# Dispatcher integration for testing

Dispatcher is a standalone React app. It makes API requests and falls back to an editable JSON file. Its login defaults to a predefined test account, with an optional Auth API mode. Backend authentication/session enforcement belongs to the service team. This frontend change creates no backend services, routes or database tables.

## Data flow

1. A screen asks `frontend/src/dispatcher/data/dispatcherRepository.ts` for data.
2. The HTTP helper requests the configured API, without auth headers.
3. If the API is unavailable, errors, or times out after three seconds, it fetches `/data/dispatcher.json` from the app's own static files.
4. `data/fileData.ts` maps that JSON into the expected response. A banner identifies file data.

The file lives at `frontend/src/dispatcher/public/data/dispatcher.json` and is copied into production builds automatically. Edit it and reload to change demo data. `dateOffset` keeps sample orders relative to today; no database or Docker setup is needed.

Request cancellation never triggers fallback. Successful empty API responses are preserved. The app polls APIs every minute, so available services can replace fallback data without changing screens. If both API and file are unavailable, the screen shows an error and Retry control.

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

Planning currently returns stub schedules; the UI labels those responses. Existing backend auth remains untouched; rejected unauthenticated requests use file data for this testing workflow.

## Optional mappings for future services

The repository keeps these mappings isolated so service developers can replace the URLs and response mapping when their contracts are ready. These endpoints are **not implemented by this frontend change**; the JSON file supplies their data meanwhile.

| Data | Current placeholder mapping |
| --- | --- |
| Category totals | GET `/api/orders/dispatcher/overview?date=…` |
| Cutoff windows | GET `/api/orders/dispatcher/windows?from=…&to=…` |
| Weekly statistics | GET `/api/analytics/dispatcher/statistics?date=…` |
| Demand chart | GET `/api/analytics/forecast/demand?date=…` |
| Incidents | GET `/api/execution/incidents` |
| Incident detail | GET `/api/execution/incidents/{id}` |
| Weekly fuel usage | GET `/api/fleet/fuel-usage/weekly?date=…&depot=…` |

Frontend interfaces for these shapes live next to the repository. Sample numbers in the file demonstrate the supplied designs; they are not calculated from live database records or advertised as a trained prediction.

## Configuration and verification

Run `npm ci` then `npm run dev` from `frontend/src/dispatcher`, and open http://127.0.0.1:5173/dispatcher.

- Local Vite proxies match the existing service ports 3002–3006.
- `VITE_API_BASE_URL` selects a gateway origin; leave empty for local proxy.
- `VITE_FILE_FALLBACK=false` disables fallback for API debugging. Default is true.
- `npm test` checks API-first behavior, unauthenticated requests, file-backed screen data, cancellation and failed file loading.
- `npm run build` validates TypeScript and builds the app and static JSON file.

## Login call

Default `VITE_LOGIN_MODE=demo` accepts username `dispatcher` and password `Dispatcher123!`, without requiring a backend. Incorrect credentials are rejected. An in-memory flag gates Dispatcher routes and is cleared on sign-out or a full reload. This is only a frontend testing flow, not production authentication; no passwords or tokens are stored.

Set `VITE_LOGIN_MODE=api` and restart Vite to use `POST /api/auth/login`, submitting `{username,password}` with JSON content type. Success opens `/dispatcher`; errors remain visible and never become successful file fallback. The service team still needs to implement backend authentication/session enforcement.

The login UI lives at `/login`, also opened by `/`. It has username/password fields and a show/hide-password control. The dev proxy forwards Auth to port 3001.

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

`GET /api/fleet/vehicles` should include optional `unavailable_periods:[{from,to}]` alongside the existing status. The frontend derives today's status and an active end date. On an absent/unavailable PUT endpoint, edits are saved locally for testing and applied to file data or a legacy list response missing calendar fields. Server calendar fields take precedence when available. Explicit 400/401/403/409/422 errors are surfaced, not converted to successful local saves.

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
