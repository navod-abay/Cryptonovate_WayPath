#!/bin/bash
# ==============================================================================
# Monorepo Initialization Script
# TeamName_SolutionName Delivery Planning Microservices Monorepo
# ==============================================================================

set -e

echo "🚀 Initializing monorepo structure..."

# Root configuration & docs
mkdir -p docs
mkdir -p infrastructure/postgres-init

# Gateway
mkdir -p gateway

# Frontend roles & core modules
mkdir -p frontend/src/dispatcher
mkdir -p frontend/src/driver
mkdir -p frontend/src/loader
mkdir -p frontend/src/store_manager
mkdir -p frontend/src/components
mkdir -p frontend/src/app

# Microservices
mkdir -p services/auth-rbac/src
mkdir -p services/order-management/src
mkdir -p services/planning-allocation/src
mkdir -p services/fleet-directory/src
mkdir -p services/execution-sync/src
mkdir -p services/analytics-prediction/src

# Create placeholder root files
touch docker-compose.yml
touch .env.example
touch README.md
touch docs/architecture.md
touch docs/data_model.md
touch docs/ai_disclosure.md
touch infrastructure/postgres-init/01-seed.sql

# Gateway files
touch gateway/config.yml
touch gateway/nginx.conf
touch gateway/Dockerfile

# Frontend files
touch frontend/package.json
touch frontend/Dockerfile
touch frontend/tsconfig.json
touch frontend/tailwind.config.js
touch frontend/postcss.config.js

# Microservices base files
for service in auth-rbac order-management planning-allocation fleet-directory execution-sync analytics-prediction; do
  touch services/$service/package.json
  touch services/$service/Dockerfile
  touch services/$service/tsconfig.json
  touch services/$service/src/index.ts
done

echo "✅ Monorepo folder tree created successfully!"
