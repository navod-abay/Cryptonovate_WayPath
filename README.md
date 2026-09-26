# Delivery Planning Microservices Monorepo

Enterprise multi-role logistics & delivery planning platform built with Node.js microservices, Next.js SaaS frontend, PostgreSQL database, and NGINX API Gateway.

---

## 🏗 Directory Architecture

```plaintext
TeamName_SolutionName/
├── docker-compose.yml       # Docker Compose setup for all services
├── .env.example             # Environment variables template
├── README.md                # Repository documentation
├── setup.sh                 # Single copy-pasteable monorepo generation script
├── docs/                    
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
├── frontend/                
│   ├── src/
│   │   ├── dispatcher/      # Dispatcher role UI module
│   │   ├── driver/          # Driver mobile UI module
│   │   ├── loader/          # Warehouse loader UI module
│   │   └── store_manager/   # Store manager UI module
│   ├── package.json         # Next.js + Tailwind CSS configuration
│   └── Dockerfile
└── services/                
    ├── auth-rbac/           # Auth & RBAC service (Port 5001)
    ├── order-management/    # Orders lifecycle service (Port 5002)
    ├── planning-allocation/ # Route optimization service (Port 5003)
    ├── fleet-directory/     # Vehicles & drivers registry (Port 5004)
    ├── execution-sync/      # Telemetry & GPS sync service (Port 5005)
    └── analytics-prediction/# Predictive ETA & analytics service (Port 5006)
```

---

## 🚀 Quick Start Guide

### 1. Execute Monorepo Setup Script (Bash)

```bash
chmod +x setup.sh
./setup.sh
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

### 3. Launch Containerized Monorepo

```bash
docker-compose up --build
```

---

## 🌐 Endpoint & Gateway Routing Map

| Service | Container Port | Gateway Route |
| :--- | :--- | :--- |
| **Next.js Frontend** | `3000` | `http://localhost/` |
| **Auth & RBAC** | `5001` | `http://localhost/api/auth/` |
| **Order Management** | `5002` | `http://localhost/api/orders/` |
| **Planning & Allocation** | `5003` | `http://localhost/api/planning/` |
| **Fleet Directory** | `5004` | `http://localhost/api/fleet/` |
| **Execution Sync** | `5005` | `http://localhost/api/execution/` |
| **Analytics & Prediction** | `5006` | `http://localhost/api/analytics/` |
| **PostgreSQL Database** | `5432` | `localhost:5432` |

---

## 🔑 Pre-Seeded Accounts (`01-seed.sql`)

All default accounts use password: **`Password123!`**

- **Dispatcher**: `dispatcher@delivery.com`
- **Loader**: `loader@delivery.com`
- **Driver**: `driver@delivery.com`
- **Store Manager**: `store_manager@delivery.com`
