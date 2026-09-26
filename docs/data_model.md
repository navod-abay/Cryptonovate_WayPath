# Data Model & Schema Specification

## PostgreSQL Core Database Schema

The database utilizes domain-partitioned schemas managed via a central PostgreSQL instance seeded automatically on initialization.

### Entity Relationship Model

```mermaid
erDiagram
    USERS {
        uuid id PK
        string username
        string email
        string password_hash
        enum role
        boolean is_active
        timestamp created_at
    }

    ORDERS {
        uuid id PK
        string order_number
        uuid store_id FK
        string status
        timestamp delivery_window_start
        timestamp delivery_window_end
    }

    ROUTES {
        uuid id PK
        uuid vehicle_id FK
        uuid driver_id FK
        string route_status
        float total_distance_km
    }

    USERS ||--o{ ROUTES : "drives as driver"
```

## Initial Seed Users (`01-seed.sql`)

| Username | Email | Role | Passphrase |
| :--- | :--- | :--- | :--- |
| `dispatcher_admin` | `dispatcher@delivery.com` | `dispatcher` | `Password123!` |
| `loader_jack` | `loader@delivery.com` | `loader` | `Password123!` |
| `driver_bob` | `driver@delivery.com` | `driver` | `Password123!` |
| `store_manager_alice` | `store_manager@delivery.com` | `store_manager` | `Password123!` |
