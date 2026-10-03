# Data distributions

The charts are made by `plot_distributions.py` (run `python3 plot_distributions.py`).
Order figures use `deliveries_train.csv` plus `task1_test_inputs.csv`: 97,321 orders
from Jan 2024 to Mar 2026. Outlet figures use `outlets.csv`.

## Questions

### 1. How many mall outlets does each brand have?

| Brand | Mall outlets | Colombo | Gampaha | Galle | Kandy |
|---|---|---|---|---|---|
| Fresh | 0 | – | – | – | – |
| Style | 9 | 4 | 2 | 1 | 2 |
| Tech | 3 | 2 | – | – | 1 |
| **Total** | **12** | 6 | 2 | 1 | 3 |

"Mall outlet" means the same 12 outlets whichever column you use:
`dock_type = mall_bay`, `parking_constraint = mall_dock`, or a non-empty `mall_window`.

### 2. How many van-only outlets does each brand have?

| Brand | Van-only outlets | Colombo | Kandy | Outlet IDs |
|---|---|---|---|---|
| Fresh | 11 | 3 | 8 | OUT001–003, OUT076–083 |
| Style | 1 | – | 1 | OUT088 |
| Tech | 1 | – | 1 | OUT093 |
| **Total** | **13** | 3 | 10 | |

All 13 van-only outlets are street docks, and they are only in Colombo and Kandy.

## Charts

Charts for one brand are in `Fresh/`, `Style/` and `Tech/`. Charts for all brands
together are in `All/`.

### 1. Order weight (`<brand>/weight_distribution.png`)

| | Orders | Median | 95th percentile | Max |
|---|---|---|---|---|
| Fresh | 92,631 | 312 kg | 704 kg | 2,220 kg |
| Style | 2,890 | 521 kg | 983 kg | 2,063 kg |
| Tech | 1,800 | 829 kg | 2,268 kg | 4,563 kg |
| All | 97,321 | 320 kg | 765 kg | 4,563 kg |

All brands are right-skewed: most orders are moderate, with a long tail of large ones.
Tech has the heaviest orders and the widest spread. Fresh is 95% of all orders, so the
"All" chart looks almost the same as Fresh.

### 2. Order volume (`<brand>/volume_distribution.png`)

| | Median | 95th percentile |
|---|---|---|
| Fresh | 1.69 m³ | 3.79 m³ |
| Style | 8.37 m³ | 15.53 m³ |
| Tech | 2.78 m³ | 7.42 m³ |
| All | 1.73 m³ | 4.66 m³ |

The brand ranking differs for volume and weight:

- Style has the bulkiest orders but not the heaviest; they are light for their size.
- Tech is the reverse: heavy for its size.

A single Style order (median 8.4 m³) fills most of a van, since vans hold 7–9 m³. For
Style, volume is likely to be the binding capacity limit. For Tech, weight is.

### Fresh chilled vs dry orders (`Fresh/chilled_*_distribution.png`, `Fresh/dry_*_distribution.png`)

| Fresh | Orders | Median weight | p95 weight | Median volume | p95 volume |
|---|---|---|---|---|---|
| Chilled | 37,031 | 278 kg | 650 kg | 1.50 m³ | 3.50 m³ |
| Dry (ambient) | 55,600 | 332 kg | 737 kg | 1.80 m³ | 3.96 m³ |

Both have the same right-skewed shape. Chilled orders are 12–17% smaller than dry ones,
by weight and by volume, at both the median and the 95th percentile.

### Fresh chilled order size by weekday (`Fresh/chilled_volume_by_weekday_hist.png`, `Fresh/chilled_weight_by_weekday_hist.png`)

| | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|
| Chilled orders | 5,684 | **6,839** | 5,862 | 6,781 | 5,263 | 6,602 |
| Median volume | 1.47 m³ | **1.36 m³** | 1.41 m³ | 1.50 m³ | **1.76 m³** | 1.67 m³ |
| p95 volume | 3.46 m³ | 3.11 m³ | 3.46 m³ | 3.28 m³ | 3.89 m³ | 3.73 m³ |
| Median weight | 272 kg | 250 kg | 260 kg | 276 kg | 326 kg | 310 kg |

- Tuesday has the most chilled orders but the smallest ones, in a tight peak around
  1.2–1.4 m³.
- Friday and Saturday orders are the largest.
- Friday's distribution is flat and wide rather than single-peaked.

Tuesday's heavy deferrals therefore come with many small orders, not large ones.

### 3. Orders by day of week (`<brand>/orders_by_weekday.png`)

| | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|
| Fresh | 14,964 | 16,119 | 15,062 | 15,981 | 14,623 | 15,882 | 0 |
| Style | 464 | **0** | 460 | **1,265** | 585 | 116 | 0 |
| Tech | 133 | 344 | 322 | 180 | 510 | 311 | 0 |
| All | 15,561 | 16,463 | 15,844 | 17,426 | 15,718 | 16,309 | 0 |

- No orders fall on a Sunday.
- Fresh is spread almost evenly from Monday to Saturday.
- Style has none on Tuesdays and a strong peak on Thursdays, when it gets 44% of its
  orders.
- Tech peaks on Fridays and is low on Mondays.

These weekday patterns will matter for the Task 2a weekly forecast.

### 4. Loading windows (`All/mall_loading_windows.png`, `All/all_outlet_windows.png`)

The assumption that only mall outlets have loading windows is **not right**. Every outlet
has `window_open_time` / `window_close_time`, and their pattern depends on brand and
mall status (`All/all_outlet_windows.png`):

| Outlets | Windows |
|---|---|
| Fresh (80) | Early morning: 03:00–08:00 (30), 04:00–07:45 (11), 05:00–07:30 (21), 05:30–08:00 (18) |
| Style and Tech, not in a mall (28) | 09:00–17:00 |
| Mall outlets (12) | A 2-hour `mall_window`, which matches their open/close times |

Mall windows (`All/mall_loading_windows.png`):

| Window | Outlets |
|---|---|
| 10:30–12:30 | 7 (6 Style, 1 Tech) |
| 09:00–11:00 | 3 (2 Style, 1 Tech) |
| 10:00–12:00 | 2 (1 Style, 1 Tech) |

All mall windows fall between 09:00 and 12:30. The six Colombo mall outlets are spread
over all three windows.

### 5 and 6. Fresh chilled orders by outlet (`Fresh/chilled_volume_by_outlet.png`, `Fresh/chilled_weight_by_outlet.png`)

All 80 Fresh outlets get chilled orders. There are 37,031 chilled orders, 40% of Fresh
orders. Each chart has one box per outlet, sorted by the outlet's median.

- A typical chilled order is 1.50 m³ and 278 kg. Ambient Fresh orders are slightly
  larger: 1.80 m³ and 332 kg.
- Outlets differ a lot. Median chilled volume per outlet ranges from 0.41 m³ (OUT003,
  Colombo) to 5.05 m³ (OUT031, Gampaha), about 12×. Weight shows the same range:
  75 kg to 936 kg.
- The volume and weight charts rank outlets almost identically (rank correlation 0.999).
  Chilled goods have a near-fixed density, so either measure can stand in for the other.
- The 11 van-only outlets have the smallest chilled orders. They are the bottom 11 in
  both charts, which fits them being served by vans.
- By district, Kandy has the smallest median chilled volume (0.82 m³) and Kegalle the
  largest (2.45 m³).
- Each outlet's spread is narrow compared with the gaps between outlets, so outlet
  identity is a strong predictor of order size.

## Fleet capacity (`fleet_capacity.py`, charts in `Fleet/`)

### Vehicle weight and volume capacity (`Fleet/weight_capacity_distribution.png`, `Fleet/volume_capacity_distribution.png`)

| Depot | Vehicles | Truck ambient | Truck reefer | Van ambient | Van reefer | Total weight | Total volume |
|---|---|---|---|---|---|---|---|
| Peliyagoda | 38 | 27 | 7 | 2 | 2 | 188,720 kg | 1,012.5 m³ |
| Kandy | 22 | 13 | 5 | 2 | 2 | 97,470 kg | 526.0 m³ |

- Trucks carry 3,610–7,200 kg and 19.4–38 m³.
- Vans carry 1,040–1,200 kg and 7–9 m³.
- There are only 13 distinct vehicle models, and each weight capacity always comes with
  the same volume capacity. Weight and volume are therefore one ranking, not two.
- Only 8 vans exist, 4 per depot. That matters because the 13 van-only outlets (11 of
  them Fresh) can only be served by a van.

### Days when demand exceeded fleet capacity (`Fleet/daily_demand_vs_capacity.png`)

**None.** On none of the 695 days with orders did the total order weight or volume exceed
fleet capacity, under any of these definitions:

| Demand compared with | Days over | Busiest day uses |
|---|---|---|
| Whole fleet (60 vehicles) | 0 | 32% of weight, 35% of volume |
| Peliyagoda fleet | 0 | 34% of weight, 38% of volume |
| Kandy fleet | 0 | 37% of weight, 37% of volume |
| Peliyagoda chilled orders vs its reefers | 0 | 49% of weight, 53% of volume |
| Kandy chilled orders vs its reefers | 0 | 38% of weight, 40% of volume |
| Only the vehicles that ran that day | 0 | 75% of weight, 79% of volume |

A day's demand is every order with that `order_date`, including ones later deferred or
not run. Capacity counts one trip per vehicle; in practice about a third of vehicle-days
run two routes, which leaves even more room.

So total fleet capacity is never the bottleneck. The 1,543 deferred and 413 not-run
orders must come from other limits, such as:

- delivery time windows
- only 8 vans for the van-only outlets
- each route serving one brand and district
- weekly fuel quotas
- vehicles out of service

Demand peaks line up with festivals, e.g. the Peliyagoda peak on 12 Apr 2024 is just
before Sinhala and Tamil New Year.

## Deferred orders (`deferred_orders.py`, charts in `All/`)

A deferred order has `dispatch_status = deferred` and is counted on its `order_date`.
With the Task 1 test inputs included there are 1,633 deferred orders; the 1,543 quoted
earlier covered the training data only.

### By brand (`All/deferred_orders_by_brand.png`)

| | Orders | Deferred | Share deferred |
|---|---|---|---|
| Fresh, chilled | 37,031 | 1,625 | 4.39% |
| Fresh, ambient | 55,600 | 8 | 0.01% |
| Style | 2,890 | 0 | 0% |
| Tech | 1,800 | 0 | 0% |

99.5% of deferrals are Fresh chilled orders.

### By weekday (`All/deferred_orders_by_weekday.png`)

| | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|
| Deferred | 301 | **852** | 55 | 131 | 120 | 174 |
| Share of that day's orders | 1.9% | **5.2%** | 0.3% | 0.8% | 0.8% | 1.1% |

Tuesday has 52% of all deferrals. There are no orders on Sundays.

## Chilled demand and reefer use by weekday

### Fresh chilled orders (`Fresh/chilled_orders_by_weekday.png`)

| | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|
| Chilled orders | 5,684 | 6,839 | 5,862 | 6,781 | 5,263 | 6,602 |
| Average chilled m³ per day | 82 | 89 | 82 | 96 | 84 | **107** |

Chilled demand is highest on Saturday, not Tuesday, so demand alone does not explain the
Tuesday deferrals.

### Reefer vehicle usage (`vehicle_usage.py`, `Fleet/reefer_usage_by_weekday.png`)

A vehicle is in use if it runs at least one route that day.

| | Reefer trucks | Every reefer truck out | Reefer vans | Every reefer van out |
|---|---|---|---|---|
| Peliyagoda | 7 | 498 of 695 days (46–83% by weekday; lowest Wed) | 2 | never |
| Kandy | 5 | 100 of 695 days (almost all Wednesdays: 84%) | 2 | 2 days |

Each depot runs only about one reefer van a day. At Peliyagoda even that van is almost
never used on Mondays.

### Order volume by weekday (`Fleet/order_volume_by_weekday.png`)

Average chilled volume per day is 24–34% of reefer volume capacity at Peliyagoda and
18–25% at Kandy (one trip per vehicle). Total volume at Peliyagoda peaks on Thursday and
Friday (221 and 227 m³).

### Fresh vehicles running two trips a day (`Fresh/fresh_double_trips.png`, `Fresh/fresh_double_trips_by_weekday.png`)

- 3,294 vehicle-days had a vehicle run two Fresh routes, using 28 different vehicles.
  No vehicle ran more than two in a day.
- 1,752 were dry → dry and 1,542 chilled → chilled. **No vehicle ever switched between
  dry and chilled on the same day**, and every route carries a single brand and a single
  temperature.
- Kandy runs more double trips than Peliyagoda (2,107 vs 1,187) despite its smaller fleet.
- Double trips rise towards the end of the week: 501–546 a weekday from Monday to
  Thursday, then 606 on Friday and 598 on Saturday.

## Fresh chilled orders by district (`fresh_chilled_by_district.py`, charts in `byDistrict/`)

### Where the deferrals are (`byDistrict/chilled_deferrals_by_district.png`)

| District | Depot | Chilled orders | Deferred | Not run |
|---|---|---|---|---|
| **Colombo** | Peliyagoda | 6,460 | **1,292 (20.0%)** | **390 (6.0%)** |
| **Gampaha** | Peliyagoda | 4,635 | **303 (6.5%)** | 3 (0.1%) |
| Matale | Kandy | 2,780 | 12 (0.4%) | 0 |
| Kandy | Kandy | 5,559 | 8 (0.1%) | 0 |
| Kalutara | Peliyagoda | 3,243 | 7 (0.2%) | 0 |
| Kegalle | Kandy | 1,854 | 3 (0.2%) | 0 |
| The other 6 districts | | | 0 | 0 |

Colombo and Gampaha account for 98% of chilled deferrals and nearly all not-run orders.

### District × weekday (`byDistrict/chilled_deferrals_district_weekday.png`)

The Tuesday spike is Colombo and Gampaha:

| | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|
| Colombo | 286 (35%) | **593 (64%)** | 47 (5%) | 119 (9%) | 99 (9%) | 148 (12%) |
| Gampaha | 12 (2%) | **252 (24%)** | 0 | 12 (2%) | 21 (3%) | 6 (1%) |

Percentages are the share of that district's chilled orders on that weekday. On an
average Tuesday, almost two-thirds of Colombo's chilled orders are deferred. Matara never
gets chilled orders on Wednesdays.

### By outlet (`byDistrict/colombo_gampaha_outlets.png`)

- Colombo's 3 van-only outlets (OUT001–003) are almost never deferred (0.2%). They are
  served by reefer vans.
- Every other Colombo outlet loses 11–39% of its chilled orders to deferral, plus 3–14%
  not run.
- Gampaha outlets lose a steadier 5–8%, except OUT033 (1%).
- The worst outlets have ordinary windows (03:00–08:00, 05:00–07:30) and dock types, so
  the window or dock alone does not explain it.

### Colombo and Gampaha chilled order size by weekday (`byDistrict/<district>_chilled_<volume|weight>_by_weekday_hist.png`)

Bars are stacked by what happened to each order: delivered, deferred or not run.

| Colombo | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|
| Deferred or not run | 42% | **67%** | 6% | 16% | 16% | 23% |
| Median delivered order | 1.64 m³ | **0.53 m³** | 1.36 m³ | 1.32 m³ | 1.11 m³ | 1.70 m³ |
| Median deferred order | 1.49 m³ | 1.33 m³ | 1.21 m³ | 1.69 m³ | 2.13 m³ | 2.13 m³ |

- **Tuesday in Colombo:** almost every chilled order above about 0.8 m³ is deferred. What
  gets delivered is mostly the small 0.3–0.7 m³ peak, the size of the van-only outlets'
  orders (OUT001–003, served by the reefer van).
- **Monday in Colombo:** that small-order peak is missing entirely, so van-only outlets
  get no chilled orders on Mondays. This matches Peliyagoda's reefer van being almost
  unused on Mondays. The truck-served orders are then deferred at 42%.
- **Friday and Saturday:** the larger orders are the ones deferred (median about 2.1 m³).
- **Gampaha:** only Tuesday stands out (24% deferred or not run). On other days it is
  0–3%, and there is no clear size pattern.

### Not the cause

- **Vehicle capacity:** Colombo chilled routes leave at a median 21% of volume capacity
  (`byDistrict/chilled_route_utilisation_by_district.png`).
- **Demand volume:** Colombo's chilled volume per day (14.2 m³) is below Gampaha's
  (15.5 m³), and the six districts with no deferrals are all far from the depot.
- **Road disruption:** in Colombo and Gampaha, the average `disruption_index` is about the
  same for deferred and delivered chilled orders (93.4 vs 93.2).

What stands out is that the problem is confined to Peliyagoda's two nearest, busiest
districts, is much worse on Tuesdays, and spares the outlets served by vans. That points
to how Peliyagoda allocates reefer trucks to Colombo and Gampaha routes, especially early
in the week.

### Stops per Fresh route (`byDistrict/fresh_stops_per_route_by_district.png`)

Stops = distinct outlets on a route that ran. Every route stays in one district and
carries one temperature, and never visits an outlet twice.

| District | Fresh outlets | Routes | All routes | Dry routes | Chilled routes |
|---|---|---|---|---|---|
| Kalutara | 7 | 1,429 | 5.7 | 6.6 | 4.7 |
| Galle | 6 | 1,392 | 5.0 | 6.0 | 4.0 |
| Matale | 6 | 1,401 | 5.0 | 5.9 | 4.0 |
| Gampaha | 10 | 2,280 | 4.9 | 5.1 | 4.8 |
| Kandy | 12 | 3,120 | 4.4 | 4.9 | 3.9 |
| Colombo | 14 | 3,400 | 4.3 | 4.7 | 3.7 |
| Nuwara Eliya | 5 | 1,389 | 4.2 | 5.0 | 3.3 |
| Matara | 4 | 1,275 | 3.6 | 4.0 | 3.2 |
| Kegalle | 4 | 1,390 | 3.3 | 4.0 | 2.7 |
| Kurunegala | 5 | 2,201 | 2.6 | 2.5 | 2.9 |
| Puttalam | 3 | 1,390 | 2.5 | 3.0 | 2.0 |
| Badulla | 4 | 2,431 | 1.9 | 2.0 | 1.8 |

- Chilled routes make fewer stops than dry routes almost everywhere; Kurunegala is the
  only exception.
- Colombo has the most Fresh outlets (14) but averages only 3.7 stops per chilled route.
  Its chilled orders are split over many small routes, which fits the low route
  utilisation there (median 21% of volume).
- Badulla and Kurunegala run about 3.5 and 3.2 routes a day for only 4–5 outlets. These
  are long hill or suburban runs where each route serves one or two outlets.

## Vehicles not used, used once, used twice (`vehicles_not_run.py`, charts in `vehiclesNotRun/`)

Each operating day, every vehicle is counted as not used (0 routes), used once or used
twice. No vehicle runs more than two routes. The tables give the average per weekday
over 695 operating days.

| Scope | Fleet | Not used | Used once | Used twice |
|---|---|---|---|---|
| Whole company, all vehicles | 60 | 30–32 | 16–22 | 6–12 |
| Peliyagoda, all vehicles | 38 | 20–21 | 11–14 | 3–7 |
| Peliyagoda chilled routes, all vehicles | 38 | 30–31 | 6–8 | 0.1–1.5 |
| Whole company, reefers | 16 | 2.7–4.3 | 9.5–11.2 | 2.0–2.6 |
| Peliyagoda, reefers | 9 | 1.2–2.3 | 6.3–7.6 | 0.1–1.5 |
| Peliyagoda chilled routes, reefers | 9 | 1.2–2.3 | 6.3–7.6 | 0.1–1.5 |

Peliyagoda reefers by weekday (chilled routes; identical to all Peliyagoda reefer routes):

| | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|
| Not used | 2.3 | 1.3 | 1.6 | 1.2 | 1.3 | 1.2 |
| Used once | 6.7 | 6.8 | 6.5 | 7.6 | 7.5 | 6.3 |
| Used twice | **0.1** | 0.9 | 0.9 | 0.2 | 0.2 | 1.5 |

- About half the fleet is idle every day. 16 vehicles never ran a single route:
  VEH010, 011, 013, 014, 019, 023, 024, 026, 029–033, 051, 053 and 054.
- Peliyagoda's reefers only ever carry chilled goods (the two Peliyagoda reefer tables
  are identical).
- Peliyagoda's 7 reefer trucks are each out on 90–98% of days. The idle reefer is almost
  always the reefer van **VEH036, used on only 21 of 695 days**.
- **Peliyagoda reefers rarely make a second trip**: 0.1 a day on Mondays, under 1 on most
  days, 1.5 on Saturdays. Colombo and Gampaha lose many chilled orders to deferral on
  Mondays and Tuesdays, yet on those days there is both an idle reefer van and almost
  no second trips. Spare reefer capacity exists but is not used.
