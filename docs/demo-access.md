# Demo access

Seeded app URLs and sign-ins for each actor, on a stack started with `docker compose up`.
On the deployed server, replace `localhost` with the server's address (`13.234.125.157`).
Every seeded password is `Password123!`.

| Actor | URL | Sign in |
|---|---|---|
| Dispatcher | http://localhost:4173 | `dispatcher_admin` / `Password123!` |
| Store manager | http://localhost:4174 | `manager_out015`, `manager_out021` or `manager_out034` / `Password123!` (mock API by default, see below) |
| Loader (Peliyagoda kiosk) | http://localhost:4175 | PIN only (see loaders below) |
| Driver | Android app (`frontend/src/driver_mobile`) | Depot + PIN `1` + vehicle number: VEH001 → `1001`, VEH027 → `1027` |
| API docs | http://localhost:8080 (only with `docker compose --profile dev up`) | — |
| API gateway | http://localhost/api/... | — |

## Loaders

| Name | Depot | PIN |
|---|---|---|
| Thilak Senanayake | Peliyagoda | `1234` |
| Nuwan Perera | Peliyagoda | `2345` |
| Kasun Fernando | Peliyagoda | `3456` |
| Ruwan Jayasinghe | Kandy | `4567` |
| Chaminda Bandara | Kandy | `5678` |

The loader kiosk serves one depot (`LOADER_DEPOT`, Peliyagoda by default), so only that depot's
PINs work there. With demo data on, three of Thilak's trucks start the day already checked in.

## Drivers

One driver per vehicle, `driver_veh001` … `driver_veh060`, listed in
`services/auth-rbac/seed-data/drivers.csv`. The app signs in with the depot and PIN.

## Store manager

The store manager app runs on its own mock API unless it is built with
`STORE_MANAGER_USE_MOCK_API=false`; the accounts above are the mock ones. Against the real API, the
seeded account is `manager_out001` / `Password123!` (outlet OUT001).
