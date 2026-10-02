# Algorithm 3 vs algorithm 2 on Task 2B scenario S1

5 seeds x 2000 iterations each. F = algorithm 2's objective (algorithm 3's lost-second-trip term left out so the two are comparable).

| | Algorithm 2 | Algorithm 3 |
|---|---|---|
| Orders served, mean (of 85) | 74.4 | 75.6 |
| Orders served, best | 75 | 77 |
| Chilled served, mean (of 26) | 16.4 | 17.6 |
| Chilled served, best | 17 | 19 |
| Objective F, mean | 11,328.6 | 10,157.0 |
| Objective F, best | 10,738.3 | 8,773.8 |
| Fuel (litres), mean | 469 | 489 |
| Distance (km), mean | 3,586 | 3,673 |
| Vehicles used, mean | 13.0 | 13.4 |
| Reefers running two trips, mean | 3.0 | 3.2 |
| Late minutes, mean | 0 | 0 |
| Run time (s), mean | 6.9 | 9.7 |

**Upper bound:** the available reefers can carry at most **21 of 26** chilled orders (ignoring dry orders). Bound plan: VEH003 Colombo 1 orders 39 min; VEH003 Kurunegala 3 orders 210 min; VEH006 Colombo 4 orders 109 min; VEH006 Gampaha 3 orders 101 min; VEH007 Gampaha 3 orders 100 min; VEH007 Kalutara 3 orders 134 min; VEH036 Colombo 2 orders 64 min; VEH036 Colombo 2 orders 64 min

## Per seed

| Algorithm | Seed | Served | Chilled | F | Litres | Vehicles | Seconds |
|---|---|---|---|---|---|---|---|
| algorithm 2 | 0 | 75 | 17 | 10,738.3 | 478 | 13 | 7 |
| algorithm 3 | 0 | 76 | 18 | 9,742.8 | 483 | 13 | 10 |
| algorithm 2 | 1 | 74 | 16 | 11,722.3 | 462 | 13 | 7 |
| algorithm 3 | 1 | 75 | 17 | 10,773.4 | 493 | 14 | 10 |
| algorithm 2 | 2 | 74 | 16 | 11,721.9 | 462 | 13 | 7 |
| algorithm 3 | 2 | 77 | 19 | 8,773.8 | 494 | 14 | 10 |
| algorithm 2 | 3 | 75 | 17 | 10,738.7 | 479 | 13 | 7 |
| algorithm 3 | 3 | 75 | 17 | 10,754.9 | 495 | 13 | 10 |
| algorithm 2 | 4 | 74 | 16 | 11,721.9 | 462 | 13 | 7 |
| algorithm 3 | 4 | 75 | 17 | 10,740.0 | 480 | 13 | 9 |

## Best algorithm 3 plan

Served 77 of 85; deferred: S1-056 (Galle chilled, 3.8 m³), S1-058 (Galle chilled, 16.5 m³), S1-064 (Matara chilled, 6.8 m³), S1-067 (Matara chilled, 5.2 m³), S1-071 (Kurunegala chilled, 12.0 m³), S1-073 (Kurunegala chilled, 5.8 m³), S1-075 (Kurunegala chilled, 7.2 m³), S1-078 (Kurunegala Style, 40.7 m³)

Feasibility (booklet rules 1-7): all rules pass.

| Operator | Final weight |
|---|---|
| destroy: random | 6.40 |
| destroy: shaw | 5.18 |
| destroy: worst | 3.53 |
| destroy: district | 4.41 |
| repair: greedy | 3.33 |
| repair: regret | 5.61 |
| repair: tw_regret | 5.63 |
