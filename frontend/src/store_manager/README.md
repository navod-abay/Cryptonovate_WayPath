# Store Manager app (WayPath)

Standalone **Vite + React + TypeScript** app for the store manager role. It runs on mock data for now; no backend is needed.

## Run it

Requires Node.js 20+.

```bash
cd frontend/src/store_manager
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build to `dist/`), `npm run preview`, `npm run typecheck`.

### Demo clock

Order windows close at **4:00 PM the day before delivery**, so what the screens show depends on the time of day.
Add `?time=HH:mm` to any URL to fake the time (it keeps ticking), e.g.

- `http://localhost:5173/?time=14:10` – order window open, countdowns running
- `http://localhost:5173/?time=17:30` – window closed

Mock data resets on page reload.

## Screens

| Route | Screen (Figma frame) |
|---|---|
| `/` | Home: today's deliveries, orders for the next delivery day, recent updates, this week, alerts (2, 9, 17, 20) |
| `/orders/new/:type` | Place / edit a chilled or dry order (4, 10, 11, 12) |
| `/orders/:orderId` | Order progress, ETA or deferred reason (13, 14) |
| `/orders` | Order history (not in Figma) |
| `/deliveries/today` | Delivery on the way / arrived, start unloading (16, 18) |
| `/deliveries/:id/receive` | Confirm what arrived, report damaged/missing, confirmation code (5, 6, 7, 8, 15, 19) |
| `/deliveries/past` | Past deliveries (not in Figma) |

Navbar shortcuts: the snowflake and carrot tiles open a new chilled / dry order.

## Structure

```
src/
  api/storeManagerApi.ts   # the only place that changes data; each function notes the backend endpoint it will call
  state/store.ts           # tiny global store (useSyncExternalStore); pages read with useAppStore(selector)
  mock/                    # seed data, product catalogue, demo clock
  components/              # store-manager components (Navbar, Modal, QuantityStepper, Timeline, ...)
  pages/                   # one file per route
  styles/tokens.css        # store-manager tokens (cyan / amber / maroon scales, font) on top of --wp-* vars
  utils/                   # date + text helpers
```

### Shared components

`@waypoint/ui` (frontend/packages/ui) is used straight from source through an alias in `vite.config.ts`, so it does not need to be built. Used here: `PrimaryButton`, `Badge`, `SelectableCard`, `SelectableChip`, and the shared `--wp-*` CSS variables.

Components built here that could move into the shared library later: `Modal`, `QuantityStepper`, `Card`, `Banner`, `KeyValueList`, `Timeline`, `CarouselNav`, `RouteProgress`.

## Connecting the backend later

Replace the mock bodies in `src/api/storeManagerApi.ts` with `fetch` calls through the gateway (`/api/<service>/...`), then `setState` with the response. Pages don't need to change.
