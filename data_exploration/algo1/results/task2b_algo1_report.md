# Algorithm 1 on Task 2B scenario S1

Hyperparameters: {'P_MIN': 1, 'OUTLET_DEFERRAL_WINDOW': 7, 'SUFFICIENT_WEIGHT_UTIL': 0.8, 'SUFFICIENT_VOLUME_UTIL': 0.8}

Available vehicles: 28 of 38 (4 reefers: VEH003 truck 26.4 m³, VEH006 truck 33.4 m³, VEH007 truck 19.4 m³, VEH036 van 7.0 m³)

## Outcome

Served 70 of 85 orders; deferred 15. Vehicles used: 14, trips: 23.

| Category | Orders | Served | Deferred | Weight (kg) | Volume (m³) |
|---|---|---|---|---|---|
| fresh_chilled | 26 | 12 | 14 | 32,780 | 181.6 |
| fresh_dry | 49 | 49 | 0 | 24,838 | 133.0 |
| style | 5 | 4 | 1 | 4,878 | 77.2 |
| tech | 5 | 5 | 0 | 5,642 | 18.1 |

## Deferred orders

| order_ref | Outlet | Category | District | Van only | Weight (kg) | Volume (m³) | p |
|---|---|---|---|---|---|---|---|
| S1-005 | OUT003 | fresh_chilled | Colombo | yes | 318 | 1.73 | 0 |
| S1-007 | OUT004 | fresh_chilled | Colombo |  | 568 | 2.92 | 0 |
| S1-009 | OUT005 | fresh_chilled | Colombo |  | 1,697 | 10.09 | 0 |
| S1-012 | OUT007 | fresh_chilled | Colombo |  | 1,991 | 11.72 | 0 |
| S1-014 | OUT008 | fresh_chilled | Colombo |  | 714 | 4.00 | 0 |
| S1-016 | OUT009 | fresh_chilled | Colombo |  | 1,241 | 6.94 | 0 |
| S1-021 | OUT013 | fresh_chilled | Colombo |  | 2,007 | 9.90 | 0 |
| S1-028 | OUT026 | fresh_chilled | Gampaha |  | 1,190 | 6.37 | 0 |
| S1-031 | OUT028 | fresh_chilled | Gampaha |  | 1,210 | 6.88 | 0 |
| S1-033 | OUT029 | fresh_chilled | Gampaha |  | 1,037 | 6.23 | 0 |
| S1-035 | OUT030 | fresh_chilled | Gampaha |  | 1,203 | 7.43 | 0 |
| S1-046 | OUT043 | fresh_chilled | Kalutara |  | 951 | 5.08 | 0 |
| S1-048 | OUT044 | fresh_chilled | Kalutara |  | 907 | 5.02 | 0 |
| S1-051 | OUT046 | fresh_chilled | Kalutara |  | 1,072 | 5.93 | 0 |
| S1-078 | OUT070 | style | Kurunegala |  | 2,562 | 40.66 | 0 |

## Feasibility check (booklet rules 1-7)

2 violations:

- rule 7: VEH006 Fresh trips take 387 min (budget 270)
- rule 7: VEH018 Fresh trips take 278 min (budget 270)
