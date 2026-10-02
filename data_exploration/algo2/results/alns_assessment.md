# Assessment of `alns_decisions.csv`

| Metric | algorithm | historical |
|---|---|---|
| orders | 5,014 | 5,014 |
| deferral events (order-days) | 1 | 108 |
| orders ever deferred | 1 | 90 |
| share of orders deferred | 0.0% | 1.8% |
| orders never served | 0 | 0 |
| longest continuous deferral (days) | 1 | 2 |
| mean run for deferred orders (days) | 1.00 | 1.20 |
| orders deferred 2+ days in a row | 0 | 18 |
| orders deferred 3+ days in a row | 0 | 0 |
| outlets with any deferral | 1 of 120 | 26 of 120 |
| deferrals at the worst outlet | 1 | 14 |
| share of deferrals at the worst 5 outlets | 100.0% | 56.5% |
| Gini of deferrals across outlets (0 = even, 1 = one outlet) | 0.99 | 0.90 |

Historical = what happened in the data (dispatch_date vs order_date; `not_run` orders count as one deferral and never served). It is not a like-for-like baseline if the algorithm leaves out constraints the real operation had (time windows, travel times, vehicle downtime).

## Deferral events by category

| | algorithm | historical |
|---|---|---|
| fresh_chilled | 1 | 108 |

## Deferral events by district

| | algorithm | historical |
|---|---|---|
| Matara | 1 | 0 |
| Colombo | 0 | 93 |
| Gampaha | 0 | 9 |
| Matale | 0 | 6 |

## Deferral events by weekday

| | algorithm | historical |
|---|---|---|
| Tue | 1 | 48 |
| Mon | 0 | 14 |
| Wed | 0 | 1 |
| Thu | 0 | 12 |
| Fri | 0 | 7 |
| Sat | 0 | 26 |

## Deferred orders by longest continuous run (days)

| | algorithm | historical |
|---|---|---|
| 1 | 1 | 72 |
| 2 | 0 | 18 |

## Worst 10 outlets (deferral events)

| | algorithm | historical |
|---|---|---|
| OUT062 | 1 | 0 |
| OUT008 | 0 | 14 |
| OUT012 | 0 | 14 |
| OUT010 | 0 | 12 |
| OUT011 | 0 | 11 |
| OUT006 | 0 | 10 |
| OUT009 | 0 | 10 |
| OUT013 | 0 | 7 |
| OUT004 | 0 | 5 |
| OUT005 | 0 | 5 |
| OUT007 | 0 | 3 |

## Routes (algorithm)

| Metric | Value |
|---|---|
| vehicle-trips per day | 34.31 |
| vehicles used per day | 26.25 |
| vehicles running 2 trips per day | 8.06 |
| stops per trip | 3.17 |
| km per day | 5,079.22 |

### Median fill by category (share of capacity)

| Category | Weight | Volume |
|---|---|---|
| fresh_chilled | 53% | 45% |
| fresh_dry | 49% | 42% |
| fresh_mixed | 49% | 52% |
| style | 30% | 80% |
| tech | 56% | 29% |
