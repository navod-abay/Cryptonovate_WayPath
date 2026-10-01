# ALNS (algorithm 2) on Task 2B scenario S1

2000 iterations, seed 0, 6 s. Objective F(S) = 10,738.3 (initial 16,501.8).

## Served orders

| Category | Orders | Served (ALNS) | Served (algorithm 1) |
|---|---|---|---|
| fresh_chilled | 26 | 17 | 12 |
| fresh_dry | 49 | 49 | 49 |
| style | 5 | 4 | 4 |
| tech | 5 | 5 | 5 |
| **Total** | 85 | **75** | 70 |

## Plan

- Vehicles used: 13 of 28 available; trips: 23
- Distance: 3,625 km; fuel: 478 litres
- Late arrivals: 0 orders, 0 late minutes in total

## Deferred orders

| order_ref | Outlet | Category | District | Van only | Weight (kg) | Volume (m³) | h |
|---|---|---|---|---|---|---|---|
| S1-012 | OUT007 | fresh_chilled | Colombo |  | 1,991 | 11.72 | 0 |
| S1-021 | OUT013 | fresh_chilled | Colombo |  | 2,007 | 9.90 | 0 |
| S1-056 | OUT053 | fresh_chilled | Galle |  | 671 | 3.75 | 0 |
| S1-058 | OUT054 | fresh_chilled | Galle |  | 2,742 | 16.52 | 0 |
| S1-071 | OUT065 | fresh_chilled | Kurunegala |  | 2,219 | 12.04 | 0 |
| S1-073 | OUT066 | fresh_chilled | Kurunegala |  | 1,049 | 5.77 | 0 |
| S1-075 | OUT067 | fresh_chilled | Kurunegala |  | 1,325 | 7.24 | 0 |
| S1-064 | OUT060 | fresh_chilled | Matara |  | 1,278 | 6.78 | 0 |
| S1-067 | OUT062 | fresh_chilled | Matara |  | 930 | 5.19 | 0 |
| S1-078 | OUT070 | style | Kurunegala |  | 2,562 | 40.66 | 0 |

## Feasibility check (booklet rules 1-7)

All rules pass.

## Final operator weights

| Operator | Weight |
|---|---|
| destroy: random | 6.89 |
| destroy: shaw | 5.15 |
| destroy: worst | 6.56 |
| repair: greedy | 4.62 |
| repair: regret | 6.86 |
| repair: tw_regret | 6.80 |

Iteration outcomes: accepted 1335, rejected 564, better 65, best 36, initial 1

Convergence: `task2b_alns_convergence.png`
