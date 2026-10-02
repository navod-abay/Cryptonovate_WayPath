# Assessment of `algo1_decisions.csv`

| Metric | algorithm | historical |
|---|---|---|
| orders | 97,321 | 97,321 |
| deferral events (order-days) | 0 | 2,430 |
| orders ever deferred | 0 | 2,046 |
| share of orders deferred | 0.0% | 2.1% |
| orders never served | 0 | 413 |
| longest continuous deferral (days) | 0 | 2 |
| mean run for deferred orders (days) | 0.00 | 1.19 |
| orders deferred 2+ days in a row | 0 | 384 |
| orders deferred 3+ days in a row | 0 | 0 |
| outlets with any deferral | 0 of 120 | 58 of 120 |
| deferrals at the worst outlet | 0 | 272 |
| share of deferrals at the worst 5 outlets | 0.0% | 51.9% |
| Gini of deferrals across outlets (0 = even, 1 = one outlet) | 0.00 | 0.89 |

Historical = what happened in the data (dispatch_date vs order_date; `not_run` orders count as one deferral and never served). It is not a like-for-like baseline if the algorithm leaves out constraints the real operation had (time windows, travel times, vehicle downtime).

## Deferral events by category

| | algorithm | historical |
|---|---|---|
| fresh_chilled | 0 | 2,402 |
| fresh_dry | 0 | 13 |
| style | 0 | 7 |
| tech | 0 | 8 |

## Deferral events by district

| | algorithm | historical |
|---|---|---|
| Colombo | 0 | 2,056 |
| Gampaha | 0 | 316 |
| Kandy | 0 | 16 |
| Badulla | 0 | 15 |
| Matale | 0 | 12 |
| Kalutara | 0 | 7 |
| Nuwara Eliya | 0 | 5 |
| Kegalle | 0 | 3 |

## Deferral events by weekday

| | algorithm | historical |
|---|---|---|
| Mon | 0 | 375 |
| Tue | 0 | 1,134 |
| Wed | 0 | 89 |
| Thu | 0 | 246 |
| Fri | 0 | 226 |
| Sat | 0 | 360 |

## Deferred orders by longest continuous run (days)

| | algorithm | historical |
|---|---|---|
| 1 | 0 | 1,662 |
| 2 | 0 | 384 |

## Worst 10 outlets (deferral events)

| | algorithm | historical |
|---|---|---|
| OUT010 | 0 | 272 |
| OUT012 | 0 | 264 |
| OUT008 | 0 | 250 |
| OUT011 | 0 | 243 |
| OUT006 | 0 | 232 |
| OUT009 | 0 | 210 |
| OUT014 | 0 | 155 |
| OUT007 | 0 | 132 |
| OUT004 | 0 | 127 |
| OUT005 | 0 | 85 |

## Routes (algorithm)

| Metric | Value |
|---|---|
| vehicle-trips per day | 32.29 |
| vehicles used per day | 25.28 |
| vehicles running 2 trips per day | 7.01 |
| stops per trip | 4.34 |
| km per day | 4,902.80 |

### Median fill by category (share of capacity)

| Category | Weight | Volume |
|---|---|---|
| fresh_chilled | 32% | 34% |
| fresh_dry | 64% | 58% |
| style | 30% | 88% |
| tech | 58% | 30% |
