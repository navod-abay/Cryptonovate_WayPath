# Data exploration

Notes and scripts from exploring the Tech Triathlon 2026 challenge data.

The scripts read the challenge data from `../data/` (the repo's `data/` folder).

## Files

| File | What it is |
|---|---|
| `visualize_outlets.py` | Builds a networkx graph of depots and outlets and draws `outlets_network.png` |
| `outlets_network.png` | The rendered outlet network |
| `plot_distributions.py` | Order weight, volume and weekday charts, loading windows, Fresh chilled orders by outlet |
| `Fresh/`, `Style/`, `Tech/`, `All/` | Charts from `plot_distributions.py`, one folder per brand plus all brands |
| `fleet_capacity.py` | Vehicle capacity charts and a count of days when demand exceeded fleet capacity |
| `Fleet/` | Charts from `fleet_capacity.py` |
| `deferred_orders.py` | Deferred orders by brand and by weekday (charts in `All/`) |
| `vehicle_usage.py` | Reefer usage and order volume by weekday (`Fleet/`), Fresh double trips (`Fresh/`) |
| `fresh_chilled_by_district.py` | Fresh chilled demand, deferrals and routes by district |
| `byDistrict/` | Charts from `fresh_chilled_by_district.py` |
| `vehicles_not_run.py` | Vehicles not used / used once / used twice by weekday, all vehicles and reefers |
| `vehiclesNotRun/` | Charts from `vehicles_not_run.py` |
| `algo-1.md` | Specification of routing algorithm 1 |
| `algo1/algo1.py` | Algorithm 1, back-tested day by day on all orders; writes `algo1/results/algo1_decisions.csv` and `algo1_routes.csv` |
| `algo1/assess_algo.py` | Scores a decisions CSV: deferrals, continuous deferrals, spread across outlets (`--historical` compares with the data) |
| `algo2/alns.py` | Algorithm 2: ALNS (random / Shaw / worst removal; greedy / regret-k / time-window regret insertion) with booklet time budgets and soft time windows |
| `algo2/run_task2b.py` | Runs ALNS on Task 2B scenario S1, checks booklet rules 1-7, compares with algorithm 1 (`algo2/results/task2b_alns_*`) |
| `algo2/backtest.py` | Day-by-day ALNS back-test; writes decisions/routes CSVs for `algo1/assess_algo.py` |
| `dataDistributions.md` | What the distribution and fleet charts show, plus mall and van-only outlet counts |

Run a script with `python3 <script>.py` (needs `networkx`, `matplotlib`, `pandas`).

## Outlet network (`visualize_outlets.py`)

- Colour = `brand` (Fresh, Style, Tech). Marker = `parking_constraint`
  (circle normal, triangle van only, square mall dock). Depots are stars.
- The graph has 122 nodes (120 outlets, 2 depots) and 886 edges, each with `km` and
  `freeflow_min`:
  - 120 depot–outlet edges, weight = the district's `depot_to_district_km`
  - 766 outlet–outlet edges between every pair in the same district, weight = `inter_stop_km`
- In the image, spoke length is to scale and spoke direction is the district's rough
  compass bearing. Colombo and Kandy are turned slightly so they don't cover their depot.
  Outlet clusters are spread for readability only; their spacing is not to scale.

Patterns in `outlets.csv`:

- Dock type and parking constraint almost go together:
  - all 12 mall bays have mall-dock parking
  - all 13 van-only outlets are street docks
  - rear docks always have normal parking
- Van-only outlets are only in Colombo and Kandy. Mall bays are only in Colombo,
  Gampaha, Kandy and Galle.

## General Data schemas

All files are CSV. `DISTRICTS` means the 12 districts: Badulla, Colombo, Galle,
Gampaha, Kalutara, Kandy, Kegalle, Kurunegala, Matale, Matara, Nuwara Eliya, Puttalam.
Ranges and allowed values are what appears in the data.

| File | Rows | Key | Columns |
|---|---|---|---|
| `calendar.csv` | 910 | `date` (2024-01-01 to 2026-06-28) | `dow` 0–6 (0 = Mon), `dow_name`, `is_weekend` 0/1, `iso_year`, `iso_week` 1–52, `is_payday` 0/1, `festival` (empty on 892 days; christmas, deepavali, esala, new_year, poson, thai_pongal, vesak), `festival_ramp` 0.0–1.0, `is_holiday` 0/1, `monsoon` 0/1, `is_operating` 0/1 |
| `district_travel.csv` | 12 | `district` | `depot` (Peliyagoda, Kandy), `road_class` (urban, suburban, highway, hill), `free_flow_kmh` 30–70, `depot_to_district_km` 8–160, `depot_to_district_freeflow_min` 16–186, `inter_stop_km` 3–18, `inter_stop_freeflow_min` 6–24 |
| `outlets.csv` | 120 | `outlet_id` (OUT001–OUT120) | `brand` (Fresh, Style, Tech), `district`, `depot`, `dock_type` (street, rear_dock, mall_bay), `parking_constraint` (normal, van_only, mall_dock), `mall_window` (set for only 12 outlets), `window_open_time` / `window_close_time` (HH:MM) |
| `road_conditions.csv` | 10,920 | `district` + `date` | `disruption_index` 40–100 (100 = normal) |
| `service_allowance.csv` | 9 | `brand` + `dock_type` | `service_allowance_min` 15–59 |
| `traffic_speed.csv` | 576 | `district` + `hour` 0–23 + `monsoon` 0/1 | `speed_index` 32–100 |
| `vehicles.csv` | 60 | `vehicle_id` (VEH001–VEH060) | `type` (truck, van), `temp` (ambient, reefer), `weight_cap_kg` 1040–7200, `volume_cap_m3` 7–38, `fuel_type` (always diesel), `km_per_l` 4.4–11.5, `weekly_fuel_quota_l` 340–620, `depot` |

How the files join:

- `district` joins `outlets`, `road_conditions` and `traffic_speed` to `district_travel`.
- `outlets` joins `service_allowance` on (`brand`, `dock_type`).
- `road_conditions.date` joins `calendar.date`.

## Orders

Orders have no item or SKU list. Each order is one row with totals:
`order_units`, `order_weight_kg`, `order_volume_m3` and `temp_requirement`
(ambient or chilled).

- Only Fresh has chilled orders. A Fresh outlet that needs both gets two orders that
  day, one ambient and one chilled.
- Median weight per unit by brand:

  | Brand | Median kg per unit |
  |---|---|
  | Fresh | about 6.8 |
  | Style | about 14.8 |
  | Tech | about 212 |

- In `deliveries_train.csv` (92,307 orders), `dispatch_status` is attempted for 90,351,
  deferred for 1,543 and not_run for 413.
- Order data appears in:
  - `deliveries_train.csv` and `task1_test_inputs.csv`: with the route and vehicle used
  - `task2b_peak_day_scenarios.csv`: no route or vehicle, because assigning them is the task
