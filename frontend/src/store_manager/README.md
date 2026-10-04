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

### Signing in

The app opens on the login page. Demo store manager accounts (password `Password123!` for all):

| Username | Store | Order categories |
|---|---|---|
| `manager_out015` | OUT015 Colombo, grocery store | Chilled + Dry groceries |
| `manager_out021` | OUT021 Kandy, tech store | Tech |
| `manager_out034` | OUT034 Galle, style store | Style |

The store type decides the category icons in the navbar, the order screens and the mock data. The session is kept for the browser tab, so a reload keeps you signed in. Accounts live in `src/mock/users.ts`, and `src/api/authApi.ts` is the only file to change when auth-rbac is connected.

### Demo clock

Order windows close at **4:00 PM the day before delivery**, so what the screens show depends on the time of day.
Add `?time=HH:mm` to any URL to fake the time (it keeps ticking), e.g.

- `http://localhost:5173/?time=14:10` – order window open, countdowns running
- `http://localhost:5173/?time=17:30` – window closed

Mock data resets on page reload (the demo clock only affects the mock data and countdowns).

## Backend

The app runs on dummy APIs by default. **See [BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md)** for every endpoint, its request/response JSON and how to switch to the real backend (`VITE_USE_MOCK_API=false` in `.env.local`, see `.env.example`).

## Screens

| Route | Screen (Figma frame) |
|---|---|
| `/login` | Store manager sign in (layout from the loader login) |
| `/profile` | Profile: account details, store, change password, log out |
| `/` | Home: today's deliveries, orders for the next delivery day, recent updates, this week, alerts (2, 9, 17, 20) |
| `/orders/new/:type` | Place / edit a chilled or dry order (4, 10, 11, 12) |
| `/orders/:orderId` | Order progress, ETA or deferred reason (13, 14) |
| `/orders` | Order history (not in Figma) |
| `/deliveries/today` | Delivery on the way / arrived, start unloading (16, 18) |
| `/deliveries/:id/receive` | Confirm what arrived, report damaged/missing, confirmation code (5, 6, 7, 8, 15, 19) |
| `/deliveries/past` | Past deliveries (not in Figma) |

Navbar shortcuts: each category tile (snowflake, carrot, game controller, t-shirt) opens a new order of that type, and the profile icon on the right opens the profile page.

## Structure

```
src/
  api/                     # config, http client, authApi, storeManagerApi: the only code that talks to the backend
  state/                   # client cache of API results (store.ts) and error toasts (toasts.ts)
  config/categories.ts     # label, icon, colours and vehicle for each order category
  mock/                    # fake backend (server.ts), seed data per store, catalogue, demo accounts, demo clock
  components/              # store-manager components (Navbar, Modal, QuantityStepper, Timeline, ...)
  pages/                   # one file per route
  styles/tokens.css        # store-manager tokens (cyan / amber / maroon scales, font) on top of --wp-* vars
  utils/                   # date + text helpers
```

### Truck capacity (mock)

Each product has a weight and volume per unit, and each order type has a truck limit (chilled: 800 kg / 4 m³, dry: 2,000 kg / 10 m³). Both live in `src/mock/catalogue.ts` until the backend provides them. The order page shows total weight and volume in the summary and won't let a quantity go past the truck limit.

### Shared components

`@waypoint/ui` (frontend/packages/ui) is used straight from source through an alias in `vite.config.ts`, so it does not need to be built. Used here: `PrimaryButton`, `Badge`, `SelectableCard`, `SelectableChip`, and the shared `--wp-*` CSS variables.

Components built here that could move into the shared library later: `Modal`, `QuantityStepper`, `Card`, `Banner`, `KeyValueList`, `Timeline`, `CarouselNav`, `RouteProgress`.

