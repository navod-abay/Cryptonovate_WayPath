# Delivery Planning Microservices Monorepo

Enterprise multi-role logistics & delivery planning platform built with fully isolated Node.js and Go microservices, Vite + React web apps sharing a UI library, PostgreSQL database, and NGINX API Gateway.

---

## 🏗 Directory Architecture

```plaintext
TeamName_SolutionName/
├── docker-compose.yml       # All services; dev-only tools sit behind the `dev`/`tools` profiles
├── redocly.yaml             # OpenAPI lint config
├── .env.example             # Environment variables template
├── README.md                # Repository documentation
├── docs/                    
│   ├── api_docs.md          # API documentation (Swagger) guide
│   ├── architecture.md      # Microservice topology & NGINX routing
│   ├── data_model.md        # Database schema & seeded credentials
│   └── ai_disclosure.md     # AI assistance disclosure
├── infrastructure/          
│   └── postgres-init/       
│       └── 01-seed.sql      # Seed script creating tables & 4 seeded accounts
├── gateway/                 
│   ├── config.yml           # Gateway routes definition
│   ├── nginx.conf           # NGINX reverse proxy config
│   └── Dockerfile
├── frontend/                # Each app is standalone: own package.json and Dockerfile
│   ├── packages/ui/         # @waypoint/ui shared component library (used from source)
│   └── src/
│       ├── dispatcher/      # Dispatcher web app (Vite + React)
│       ├── store_manager/   # Store manager web app (Vite + React)
│       └── driver_mobile/   # Driver app (React Native, not in compose)
└── services/                # Each service is standalone: own Dockerfile, deps and openapi.yaml
    ├── auth-rbac/           # Auth & RBAC service (Node, port 5001)
    ├── order-management/    # Orders lifecycle service (Node, port 5002)
    ├── planning-allocation/ # Route optimization service (Go, port 5003)
    ├── fleet-directory/     # Vehicles & drivers registry (Node, port 5004)
    ├── execution-sync/      # Telemetry & GPS sync service (Node, port 5005)
    ├── analytics-prediction/# Predictive ETA & analytics service (Node, port 5006)
    └── notification-service/# Dashboard alerts: NATS consumer, REST + SSE (Node, port 5007)
```

---

## 🚀 Quick Start Guide

### 1. Configure Environment Variables

```bash
cp .env.example .env
```

### 2. Launch Containerized Stack

```bash
docker compose up --build
```

Every service builds from its own folder (`services/<name>/`), so there is no root `package.json` and no shared workspace. To work on one service outside Docker, run `npm install` (Node) or `go run .` (Go) inside its folder.

---

## 🌐 Endpoint & Gateway Routing Map

| Service | Container Port | Gateway Route |
| :--- | :--- | :--- |
| **Dispatcher Web App** | `4173` | `http://localhost:4173/` (direct, not via gateway) |
| **Store Manager Web App** | `4173` | `http://localhost:4174/` (direct, not via gateway) |
| **Loader Web App** | `4173` | `http://localhost:4175/` (direct, not via gateway) |
| **Auth & RBAC** | `5001` | `http://localhost/api/auth/` |
| **Order Management** | `5002` | `http://localhost/api/orders/` |
| **Planning & Allocation** | `5003` | `http://localhost/api/planning/` |
| **Fleet Directory** | `5004` | `http://localhost/api/fleet/` |
| **Execution Sync** | `5005` | `http://localhost/api/execution/` |
| **Analytics & Prediction** | `5006` | `http://localhost/api/analytics/` |
| **Notification Service** | `5007` | `http://localhost/api/notifications/` |
| **NATS JetStream** | `4222` (monitoring `8222`) | internal broker, not via gateway |
| **PostgreSQL Database** | `5432` | `localhost:5432` |

---

## 📖 API Documentation (Swagger, dev only)

Start the stack with the `dev` profile, then open **http://localhost:8080** to browse every service's API in one Swagger UI:

```bash
docker compose --profile dev up --build
```

Use the **Select a definition** dropdown to switch between services. A plain `docker compose up` (production) doesn't start the docs container. See [docs/api_docs.md](docs/api_docs.md) for how to add or update a service's spec.

---

## 🔑 Pre-Seeded Accounts (`01-seed.sql`)

All default accounts use password: **`Password123!`**

- **Dispatcher**: `dispatcher@delivery.com`
- **Loader**: `loader@delivery.com`
- **Driver**: `driver@delivery.com`
- **Store Manager**: `store_manager@delivery.com`

### Loaders (loader web app, PIN sign-in)

Each depot has at least one loader. Every plan shares the depot's vehicles equally among its loaders,
and the loader app shows a loader only the vehicles assigned to them. The app signs in with a 4-digit
PIN, checked against the loaders of the kiosk's depot (`LOADER_DEPOT`, default Peliyagoda):

| Loader | Depot | PIN | Username |
|---|---|---|---|
| Thilak Senanayake | Peliyagoda | `1234` | `loader_peliyagoda` |
| Nuwan Perera | Peliyagoda | `2345` | `loader_peliyagoda_2` |
| Kasun Fernando | Peliyagoda | `3456` | `loader_peliyagoda_3` |
| Ruwan Jayasinghe | Kandy | `4567` | `loader_kandy` |
| Chaminda Bandara | Kandy | `5678` | `loader_kandy_2` |

### Drivers (driver mobile app, PIN sign-in)

One driver account per vehicle (60), at the vehicle's depot. The app signs in with the depot (chosen
once on the phone) and the driver's 4-digit PIN, then shows that vehicle's trips for today.
Demo PIN = `1` + the vehicle number: **VEH001 → `1001`**, VEH038 → `1038` (Peliyagoda), VEH057 →
`1057` (Kandy). Usernames are `driver_veh001` … `driver_veh060` (password `Password123!`). Names and
PINs are in `services/auth-rbac/seed-data/drivers.csv`, regenerated by
`node services/auth-rbac/scripts/build-driver-seed.mjs`.

### Store managers (store manager web app)

One store manager account per outlet (120). The username is `manager_` plus the lowercase outlet id,
for example **`manager_out001`** (OUT001, a Fresh grocery outlet), `manager_out015` (Style) or `manager_out021` (Tech)
(each shows its own order types), all with password `Password123!`. A manager only
sees their own outlet. Names, emails and phone numbers are in
`services/auth-rbac/seed-data/store-managers.csv`, regenerated by
`node services/auth-rbac/scripts/build-store-manager-seed.mjs`.

