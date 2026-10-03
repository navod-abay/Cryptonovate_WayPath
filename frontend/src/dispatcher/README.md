# WayPath Dispatcher

A standalone React + TypeScript + Vite web application for logistics dispatch management.
Lives at `frontend/src/dispatcher/` and is fully self-contained — its own `package.json`,
`vite.config.ts`, `tsconfig.json`, Tailwind/PostCSS config, and `Dockerfile`.

---

## Quick Start

```sh
cd frontend/src/dispatcher

# Install dependencies (first time only)
npm install

# Start the dev server
npm run dev
# → http://127.0.0.1:5173/dispatcher
```

---

## All Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server at `http://127.0.0.1:5173` |
| `npm run typecheck` | Run TypeScript type-checking (`tsc --noEmit`) |
| `npm run build` | Type-check then build production bundle to `dist/` |
| `npm start` | Serve the production build locally via `vite preview` |

---

## Project Structure

```
frontend/src/dispatcher/
├── package.json          # Own dependencies — react, vite, tailwind, react-router-dom
├── vite.config.ts        # Vite config — resolves @waypoint/ui from packages/ui/src
├── tsconfig.json         # TypeScript config — paths for @waypoint/ui
├── tailwind.config.js    # Tailwind scoped to dispatcher files only
├── postcss.config.js     # PostCSS — tailwindcss + autoprefixer
├── index.html            # HTML entry point
├── Dockerfile            # Docker image for production deployment
├── .dockerignore
│
├── main.tsx              # React root — mounts App, imports fonts + global styles
├── App.tsx               # Router — defines all /dispatcher/* routes
├── styles.css            # Dispatcher-scoped styles using --wp-* design tokens
│
├── components/
│   ├── Navbar.tsx        # Top navigation bar
│   ├── DemandChart.tsx   # Order demand bar chart
│   ├── OrdersTable.tsx   # Tabular orders list
│   ├── OrderAccordion.tsx# Expandable order row
│   └── common.tsx        # Shared badge/icon/layout primitives
│
├── pages/
│   ├── Dashboard.tsx     # /dispatcher — overview dashboard
│   ├── Schedule.tsx      # /dispatcher/schedule/today — daily schedule
│   ├── Upcoming.tsx      # /dispatcher/schedule/upcoming — upcoming orders
│   ├── Orders.tsx        # /dispatcher/orders — orders with search & filter
│   ├── Fleet.tsx         # /dispatcher/fleet — vehicle list
│   └── Details.tsx       # Detail pages for trips, orders, vehicles, incidents
│
└── data/
    ├── types.ts               # TypeScript interfaces (Trip, Order, Vehicle, etc.)
    ├── seed.ts                # Static fixture data (demo clock: 28 Sep 2026, 10:30 Colombo)
    └── dispatcherRepository.ts # Single data access boundary — no live API calls
```

---

## Routes

| Route | Page |
|---|---|
| `/dispatcher` | Dashboard — warehouse KPIs, demand chart, live alerts |
| `/dispatcher/schedule/today` | Daily schedule — trips grouped by warehouse |
| `/dispatcher/schedule/upcoming` | Upcoming orders with live countdown timers |
| `/dispatcher/schedule/trips/:tripId` | Trip detail — route legs, warehouse & outlet info |
| `/dispatcher/orders` | Orders — search, category & status filters |
| `/dispatcher/orders/:orderId` | Order detail — items, deferred reason, inventory modal |
| `/dispatcher/fleet` | Fleet — vehicle list with warehouse filter |
| `/dispatcher/fleet/:vehicleId` | Vehicle detail — specs and assigned trips |
| `/dispatcher/incidents/:incidentId` | Incident report — full details and linked vehicle |

Browser Back/Forward and refreshed deep links all work via React Router.
Production hosting must rewrite all frontend routes to `index.html`.

---

## Shared Design System (`@waypoint/ui`)

The dispatcher uses the shared `@waypoint/ui` component library located at
`frontend/packages/ui/`. Vite resolves it directly from source — **no build step needed**.

Components used: `Badge`, `CarrotIcon`, `PrimaryButton`, `ItemsListModal`,
`WarehouseCard`, `OutletRow`.

Design tokens (`--wp-*` CSS variables) are imported once via `@waypoint/ui/styles` in
`main.tsx`. Dispatcher-specific styles live in `styles.css` and use those same tokens.

---

## Demo Data

All data is static fixture data — no API or backend is required to run the app.

- `data/seed.ts` — isolated fixture data
- `data/dispatcherRepository.ts` — the only data access boundary; swap this adapter when a real API exists
- Demo clock starts at **28 Sep 2026, 10:30 Asia/Colombo** and ticks while Upcoming is open; resets on page reload

---

## Docker

```sh
# Build the image (run from frontend/src/dispatcher/)
docker build -t waypath-dispatcher .

# Run — serves the production build on port 4173
docker run -p 4173:4173 waypath-dispatcher

# → http://localhost:4173/dispatcher
```
