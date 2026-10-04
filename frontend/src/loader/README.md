# Loader Application

This is the Loader Frontend Application built with React, Vite, and Tailwind CSS. It is used by warehouse loading staff to view trip manifests, manage vehicle loading, and report any item shortfalls or damages before dispatching vehicles.

## Running Locally

### Prerequisites
- Node.js
- npm or yarn

### Setup & Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```

### Localhost URL
The development server will run at:
**[http://localhost:5173](http://localhost:5173)**

### Environment Variables
The application uses the following environment variables (can be placed in a `.env` or `.env.local` file):
- `VITE_API_GATEWAY_URL`: Base URL for the backend API Gateway (defaults to `http://localhost`).
- `VITE_LOADER_DEPOT`: The depot this kiosk stands in (defaults to `Peliyagoda`). A PIN identifies one of that depot's loaders.

In Docker Compose the app runs at http://localhost:4175 (`LOADER_API_GATEWAY_URL` and `LOADER_DEPOT` set the two values at build time).

## Who sees what

Each loader signs in with their own 4-digit PIN (seeded PINs are listed in the root README). Every
planning run shares each depot's vehicles equally among the depot's loaders, and the queue shows only
the trips of the vehicles assigned to the signed-in loader. The backend enforces the same rule: a
loader cannot open, report on or dispatch another loader's trip (403).

## Loading a truck

1. **Start Loading** on a queued trip moves it to the Loading queue (**View** there resumes it).
2. Every unit carries its own label, `<orderRef>|<sku>|<unit>` (e.g. `ORD-20261005-00431|BUTTER-CTN|3`), printed as a
   QR code (the scanner also reads the same text as Code 128, e.g. from a handheld laser scanner).
   **Labels** on the loading screen opens a printable sheet with every unit label of the trip, so you
   can print them or show them on another screen for the demo.
3. The camera starts as soon as the loading screen opens and reads labels continuously. A handheld scanner (which types the code
   and presses Enter) or a code typed by hand works in the box under the camera. Each scan beeps and says
   what was counted; a label scanned twice, a unit of another truck's order, or a unit beyond the order's
   quantity is refused.
4. The red flag (or tapping an item) reports units **missing** or **damaged**; type the quantity or use − / +. The depot's dispatchers
   and the outlet's store manager get a `loader.shortfall` alert.
5. When every unit of an order is scanned or reported, and at least one was scanned, the order becomes
   `loaded` in Order Management. **Finish** offers to report any units still unscanned as missing, then
   the final check releases (dispatches) the truck.

The camera only works on a secure page: `http://localhost:4175` on the machine running the stack, or
HTTPS. A tablet opening the app over plain HTTP on the network has no camera access; use the text box or
put the gateway and app behind HTTPS.

## API Endpoints Used

### Auth Service
- `POST /api/auth/pin-login`: Sign a loader in with `{ depot, pin }` and retrieve JWT tokens.
- `POST /api/auth/refresh`: Refresh access token using the refresh token.
- `GET /api/auth/me`: Retrieve the current user's profile.

### Execution Service
- `GET /api/execution/docks/{depot}/active-trips?status={status}`: Today's trips of the vehicles assigned to the signed-in loader, with their loading status (`ready_to_load`, `loading`, `completed`). Optional `date=YYYY-MM-DD`.
- `GET /api/execution/trips/{tripId}/manifest`: The trip's orders and items in LIFO loading order, with scanned / missing / damaged counts.
- `POST /api/execution/trips/{tripId}/start`: Start (or resume) loading a trip.
- `POST /api/execution/trips/{tripId}/scans`: Record one scanned unit label.
- `POST /api/execution/trips/{tripId}/shortfall`: Report units missing or damaged during loading (alerts the dispatcher and store manager).
- `POST /api/execution/trips/{tripId}/dispatch`: Release the truck once every unit is scanned or reported.
