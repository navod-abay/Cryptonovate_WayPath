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

## API Endpoints Used

The application communicates with the backend microservices using the following API endpoints:

### Auth Service
- `POST /api/auth/login`: Authenticate user and retrieve JWT tokens.
- `POST /api/auth/refresh`: Refresh access token using the refresh token.
- `GET /api/auth/me`: Retrieve the current user's profile and permissions.

### Execution Service
- `GET /api/execution/docks/{depot}/active-trips?status={status}`: Fetch active trips and vehicles at a specific depot.
- `GET /api/execution/trips/{tripId}/manifest`: Retrieve the detailed manifest (items and stops) for a trip.
- `POST /api/execution/trips/{tripId}/shortfall`: Report missing or damaged items during the loading process.
- `POST /api/execution/trips/{tripId}/dispatch`: Mark a trip as fully loaded and dispatch the vehicle for delivery.

### Fleet Service
- `GET /api/fleet/vehicles?depot={depot}`: Fetch a list of vehicles available at a depot.
- `GET /api/fleet/vehicles/{vehicleId}`: Get detailed information for a specific vehicle.
- `PATCH /api/fleet/vehicles/{vehicleId}/status`: Update the status of a vehicle (e.g., available, in workshop).
- `POST /api/fleet/outlets/batch`: Fetch details for multiple store outlets by their IDs.
