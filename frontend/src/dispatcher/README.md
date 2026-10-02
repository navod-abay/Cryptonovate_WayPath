# WayPath Dispatcher

React + TypeScript inside the existing frontend. Vite runs this role without Next.js;
the existing Next.js starter and other role folders are preserved.

```sh
cd frontend
npm install
npm run dev
# http://127.0.0.1:5173/dispatcher
npm run typecheck
npm run build
npm start
```

The npm lockfile belongs to `frontend`. There is no repository-root package.json.
Shared `@waypoint/ui` components are resolved from `packages/ui/src` in Vite and
TypeScript, following the store-manager reference, so no library build is needed.
`main.tsx` imports the shared stylesheet once and the same Atkinson font as that role.
Next.js starter commands remain available as `dev:legacy` and `build:legacy`.

## Screens and routes

| Route | Behavior |
| --- | --- |
| `/dispatcher` | Screenshot 1 dashboard; screenshot 2 is its open Schedule menu |
| `/dispatcher/schedule/today` | Screenshot 3 daily schedule; screenshot 4 expands OUT006 |
| `/dispatcher/schedule/upcoming` | Annotation-required upcoming orders grouped by day, with live cutoff countdowns |
| `/dispatcher/schedule/trips/:tripId` | Trip route legs using shared WarehouseCard and OutletRow |
| `/dispatcher/orders` | Today's orders with search, category/status filters and empty state |
| `/dispatcher/orders/:orderId` | Order items, deferred reason and shared inventory modal |
| `/dispatcher/fleet` | Vehicle warehouse filter and availability |
| `/dispatcher/fleet/:vehicleId` | Vehicle details and assigned trips |
| `/dispatcher/incidents/:incidentId` | Full incident report and linked vehicle |

The screenshots define two pages and two interaction states. Upcoming has a written
specification but no visual frame; supporting Orders/Fleet/detail pages follow the
same visual system and are inferred to make navigation usable.

Browser Back/Forward and refreshed deep links work with React Router. Production
hosting must rewrite frontend routes to `index.html` (Vite preview does this locally).
Warehouse/date selectors and order filters use URL parameters. Schedule inventories
expand and collapse independently of navigation. Menus dismiss outside or on Escape.
All inventory entries remain accessible; panels scroll with the document rather than
cropping content to the screenshots' frame bounds.

## Demo data

`data/dispatcherRepository.ts` is the single data access boundary. No APIs, endpoints,
or backend contracts are assumed. `data/seed.ts` contains clearly isolated fixture data.
Dashboard/warehouse totals reproduce the designs; detailed lists are representative
fixtures rather than all 227 aggregate orders or all 48 vehicles.
The demo clock starts at **28 Sep 2026, 10:30 Asia/Colombo** and ticks while Upcoming
is open. It resets on reload. The daily schedule opens on the screenshot date; other
dates show a clear empty state. Alerts represent sample live-feed incidents, with no
network subscription. Real updates can replace the adapter when integration exists.

Shared components used: Badge, CarrotIcon, PrimaryButton, ItemsListModal,
WarehouseCard and OutletRow. Native semantic HTML is used for tables, dropdowns,
inputs and the navbar because the library supplies no equivalent generic components.
Dispatcher styles are separate from the legacy global CSS and reuse `--wp-*` tokens.
