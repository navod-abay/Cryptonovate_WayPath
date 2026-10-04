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

### 3. Driver Mobile App (Android)

The driver app (`frontend/src/driver_mobile`, React Native) is not part of the Docker stack; build it on your machine and install it on an Android phone.

**Prerequisites** (the versions our working build used)

| Tool | Version |
| :--- | :--- |
| Node.js | 26.7.0 (the app needs ≥ 22.11), npm 12.0.2 |
| JDK | OpenJDK 26.0.2 |
| Gradle | 9.4.1 (downloaded by `./gradlew`; nothing to install) |
| Android SDK platform | 37 (`compileSdk 37`, `targetSdk 36`, `minSdk 24`) |
| Android SDK build-tools | 37.0.0 |
| Android NDK | 27.1.12297006 |
| React Native | 0.87.1 (installed by `npm install`) |

Install the SDK pieces with Android Studio's SDK Manager (or `sdkmanager`) and set `ANDROID_HOME`, e.g. `export ANDROID_HOME=$HOME/Android/Sdk`. You also need an Android phone with USB debugging on, connected by USB (`adb devices` should list it).

```bash
cd frontend/src/driver_mobile
npm install
```

The app calls the API gateway at the address in `src/api/gateway.ts` (`http://localhost` by default). With `adb reverse`, the phone's `localhost` is your machine, so the app reaches the stack you started above.

**Option A: run in development (live reload)**

```bash
adb reverse tcp:80 tcp:80       # phone's localhost:80   -> the gateway on this machine
adb reverse tcp:8081 tcp:8081   # phone's localhost:8081 -> Metro (the JavaScript bundler)
npm start                        # Metro; leave it running
npm run android                  # in a second terminal: builds, installs and opens the app
```

Run the two `adb reverse` commands again whenever the phone is reconnected.

**Option B: build standalone APKs**

```bash
./scripts/build-apks.sh
```

This builds two release APKs, with the JavaScript bundled in so no Metro is needed, into `build/apks/`:

| APK | App name | Talks to |
| :--- | :--- | :--- |
| `WayPath-server.apk` | WayPath | `SERVER_URL` (default `http://13.234.125.157`) |
| `WayPath-local.apk` | WayPath (local) | `http://localhost`: needs `adb reverse tcp:80 tcp:80` and the stack running |

They have different app ids, so both can be installed at the same time. Install with `adb install build/apks/WayPath-server.apk`, or copy the file to the phone and open it (allow installs from that source when asked).

- `SERVER_URL=http://<host>` builds the server APK for another gateway.
- Native code is built for 64-bit ARM only (all current phones). For an older 32-bit phone, add `ARCHS=arm64-v8a,armeabi-v7a`.
- The first build takes about 7 minutes; later builds are much faster.
- The APKs are signed with the debug key: fine for testing, not for the Play Store.

**Signing in:** choose the depot and enter a driver PIN, e.g. Peliyagoda and `1001` for VEH001 (see [Drivers](#drivers-driver-mobile-app-pin-sign-in)). The app then shows that vehicle's trips for today.

---

## ☁️ AWS Deployment

The live stack runs at **13.234.125.157** (AWS `ap-south-1`, Mumbai):

| App | URL |
| :--- | :--- |
| Dispatcher | http://13.234.125.157:4173/ |
| Store Manager | http://13.234.125.157:4174/ |
| Loader (Peliyagoda kiosk) | http://13.234.125.157:4175/ |
| API gateway | http://13.234.125.157/api/... (health check: `/health`) |
| Driver app | `WayPath-server.apk` in the repository root |

[infrastructure/terraform/main.tf](infrastructure/terraform/main.tf) creates the whole deployment: a single
EC2 instance running the same Docker Compose stack as local development. There is no load balancer: the
address above is an **Elastic IP** attached directly to the instance, so it survives a stop and start.

- **Instance:** `m7i-flex.large`, Ubuntu 24.04 LTS, 30 GB encrypted gp3 disk, in the default VPC.
- **Bootstrap (first boot only):** adds 4 GB of swap, installs Docker and the Compose plugin, clones this
  repository's default branch into `/home/ubuntu/app`, copies `.env.example` to `.env` and runs
  `docker compose up -d --build`. The log is in `/var/log/user-data.log`.
- **Open ports:** 80 and 443 (gateway), 4173–4175 (web apps) and 22 (SSH, key pair `Tech3`). Everything else,
  including PostgreSQL, NATS and the API docs, is not reachable from outside.

**Creating it:**

```bash
cd infrastructure/terraform
terraform init
terraform apply        # prints the Elastic IP (fixed_application_url) and the SSH command
```

**Updating it:** the bootstrap only runs once, so later changes are pulled and rebuilt by hand:

```bash
ssh -i Tech3.pem ubuntu@13.234.125.157
cd ~/app && git pull && docker compose up -d --build
```

**API address of the web apps:** the dispatcher, store manager and loader apps have the API address built
in at build time, and `.env.example` sets it to `http://localhost`. On the server, set it to the server's
address in `~/app/.env` before building, or the apps call the visitor's own machine:

```bash
DISPATCHER_API_BASE_URL=http://13.234.125.157
STORE_MANAGER_API_BASE_URL=http://13.234.125.157
LOADER_API_GATEWAY_URL=http://13.234.125.157
```

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

