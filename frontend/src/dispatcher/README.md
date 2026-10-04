# WayPath Dispatcher

Standalone React + TypeScript + Vite app using Atkinson Hyperlegible Next throughout. Shared UI components come from `frontend/packages/ui`. Layouts support tablet portrait and landscape, with touch controls and scrollable tables.

```sh
cd frontend/src/dispatcher
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ to see the sign-in page. The predefined test username is **dispatcher** and password is **Dispatcher123!**. Incorrect credentials stay on the form. Dispatcher routes redirect to sign-in until the test login succeeds. **Sign out** returns to sign-in; a full reload also resets the in-memory login, so startup always requires signing in. No password or login token is stored.

The default `VITE_LOGIN_MODE=demo` works without an authentication backend. This is a frontend testing gate, not production security. When the service team is ready, set `VITE_LOGIN_MODE=api` in `.env.local` and restart Vite to use the existing `POST /api/auth/login` call instead. API login failures are shown and never bypassed with fixture data. Backend authentication/session enforcement remains the service team's responsibility.

## API calls and local test data

`data/dispatcherRepository.ts` contains the API calls and response-to-screen mappings. `data/http.ts` tries the API first with a three-second timeout. If the connection fails or the endpoint returns an error (including an unavailable database), it fetches `public/data/dispatcher.json` over HTTP. `data/fileData.ts` translates that file into the response shape the screen expects.

Edit [the JSON file](public/data/dispatcher.json) and refresh the browser to change test data. Order `dateOffset` values are relative to today in Asia/Colombo: 0 means today, 1 tomorrow. IDs connect order, trip, vehicle and incident details. Sample metrics are independent fixture values for demonstrating the designs. File data is cached for the current page session.

A small banner identifies file fallback. Requests retry APIs on the normal polling interval; successful APIs replace file data. Empty successful API results stay empty. No backend implementations are added by Dispatcher.

The dev proxy forwards `/api/auth`, `/api/orders`, `/api/planning`, `/api/fleet`, `/api/execution` and `/api/analytics` to local ports 5001–5006. For a remote gateway, set `VITE_API_BASE_URL` in `.env.local` and restart Vite. Set `VITE_FILE_FALLBACK=false` to expose failed API requests during integration testing.

## Schedule availability

Schedules are prepared at 5 PM Sri Lanka time on the previous day. Tomorrow's schedule is unavailable before today's 5 PM cutoff; later dates stay unavailable until their respective previous-day cutoff. The date selector remains usable and shows the preparation date with a link to upcoming orders. The screen checks the cutoff automatically and only starts schedule API requests when the selected date becomes eligible. Actual trips still depend on the Planning API or local test file.

## Fleet availability and details

Each vehicle has a **Change availability** action. Select one or more inclusive date ranges, save them, or clear the unavailable dates. Overlapping/adjacent ranges merge. Future ranges leave the vehicle available today; an active range marks it unavailable through its end date, shown on hover, keyboard focus or a tablet tap.

The frontend calls the proposed `PUT /api/fleet/vehicles/{id}/availability` endpoint. When that endpoint is absent/unavailable, the JSON fixture is the base and edits are persisted in this browser's local storage under `waypath.dispatcher.test-availability`. This does not modify the source JSON file. Validation/auth rejections are shown rather than treated as successful saves. Remove that key to reset test edits. Once the service returns `unavailable_periods` in its vehicle list, that server data takes precedence over local test overrides.

Vehicle details display weight capacity, volume capacity, weekly fuel quota and remaining fuel quota. Capacity/quota fields already exist in Fleet's vehicle response. Remaining quota is calculated from the selected vehicle's quota and consumption returned by the proposed weekly fuel endpoint. Unknown quantities remain unavailable.

Existing protected APIs may reject unauthenticated requests; those requests use the local test file. Dispatcher does not alter backend authentication. Your service developers can connect their testing endpoints by updating the repository URLs/response mapping.

See [integration notes](../../../docs/dispatcher-integration.md) for the available API mappings and the optional endpoints that can be wired as services become ready.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server and API proxy |
| `npm run typecheck` | TypeScript validation |
| `npm test` | API success, fallback and cancellation tests |
| `npm run build` | Production build |
| `npm start` | Preview build on port 4173, with file fallback |

For deployment, configure `VITE_API_BASE_URL` before building and serve `dist` with SPA fallback to `index.html`. Preview does not use the dev API proxy, but the JSON test file works there too.

Docker is optional. Build from the repository root with the frontend context (for shared UI):

```sh
docker build -f frontend/src/dispatcher/Dockerfile -t waypath-dispatcher frontend
docker run -p 4173:4173 waypath-dispatcher
```
