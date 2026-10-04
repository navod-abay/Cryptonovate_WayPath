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
    └── analytics-prediction/# Predictive ETA & analytics service (Node, port 5006)
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
| **Auth & RBAC** | `5001` | `http://localhost/api/auth/` |
| **Order Management** | `5002` | `http://localhost/api/orders/` |
| **Planning & Allocation** | `5003` | `http://localhost/api/planning/` |
| **Fleet Directory** | `5004` | `http://localhost/api/fleet/` |
| **Execution Sync** | `5005` | `http://localhost/api/execution/` |
| **Analytics & Prediction** | `5006` | `http://localhost/api/analytics/` |
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
