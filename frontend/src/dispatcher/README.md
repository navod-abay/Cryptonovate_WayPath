# WayPath Dispatcher

Standalone React + TypeScript + Vite app using Atkinson Hyperlegible Next throughout. Shared UI components come from `frontend/packages/ui`. Layouts support tablet portrait and landscape, with touch controls and scrollable tables.

```sh
cd frontend/src/dispatcher
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ to see the sign-in page. Sign in with an Auth & RBAC account (seeded dispatcher: **dispatcher_admin** / **Password123!**) via `POST /api/auth/login`. Incorrect credentials stay on the form. Dispatcher routes redirect to sign-in until login succeeds. The access and refresh tokens are kept in memory only, so **Sign out** or a full reload requires signing in again. Every API call sends the access token as a bearer header and refreshes it once on a 401.

## API calls

`data/dispatcherRepository.ts` contains the API calls and response-to-screen mappings. `data/http.ts` calls the API with a three-second timeout. There is no sample-data fallback: failed or rejected requests surface as errors on screen. Empty successful API results stay empty.

The dev proxy forwards `/api/auth`, `/api/orders`, `/api/planning`, `/api/fleet`, `/api/execution` and `/api/analytics` to local ports 5001–5006. For a remote gateway, set `VITE_API_BASE_URL` in `.env.local` and restart Vite.

## Schedule availability

Planning builds a delivery date's schedule as soon as ordering closes (16:00 Sri Lanka time on the previous operating day). The Schedule page shows a date's schedule once Planning reports a completed run for it, re-checking every 15 seconds. Until then it shows when ordering closes, from `GET /api/orders/dispatcher/windows`, and links to upcoming orders. Sundays have no deliveries.

## Fleet availability and details

Each vehicle has a **Change availability** action. Select one or more inclusive date ranges, save them, or clear the unavailable dates. Overlapping/adjacent ranges merge. Future ranges leave the vehicle available today; an active range marks it unavailable through its end date, shown on hover, keyboard focus or a tablet tap.

The frontend calls `PUT /api/fleet/vehicles/{id}/availability` and reads `unavailable_periods` from the vehicle list. Failed or rejected saves are shown as errors.

Vehicle details display weight capacity, volume capacity, weekly fuel quota and remaining fuel quota. Capacity/quota fields already exist in Fleet's vehicle response. Remaining quota is calculated from the selected vehicle's quota and consumption returned by the proposed weekly fuel endpoint. Unknown quantities remain unavailable.

Your service developers can connect their testing endpoints by updating the repository URLs/response mapping.

See [integration notes](../../../docs/dispatcher-integration.md) for the available API mappings and the optional endpoints that can be wired as services become ready.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server and API proxy |
| `npm run typecheck` | TypeScript validation |
| `npm test` | API success, error and cancellation tests |
| `npm run build` | Production build |
| `npm start` | Preview build on port 4173 |

For deployment, configure `VITE_API_BASE_URL` before building and serve `dist` with SPA fallback to `index.html`. Preview does not use the dev API proxy.

Docker is optional. Build from the repository root with the frontend context (for shared UI):

```sh
docker build -f frontend/src/dispatcher/Dockerfile -t waypath-dispatcher frontend
docker run -p 4173:4173 waypath-dispatcher
```
