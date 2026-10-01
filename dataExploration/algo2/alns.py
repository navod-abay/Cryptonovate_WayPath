"""Algorithm 2: Adaptive Large Neighbourhood Search for the multi-trip, heterogeneous-fleet VRP with time windows.

Problem (one dispatch day at one or more depots)
  * Customers are orders. Order i has volume q_i, weight w_i, service time s_i (service_allowance_min for
    its brand and dock type), time window [e_i, l_i] (the outlet's window), and h_i, how often its outlet
    was deferred recently.
  * A solution gives each vehicle k a route R_k = (T_k1, T_k2) of at most two trips. Each trip leaves the
    depot, serves one brand in one district (booklet rule 1) and returns.
  * Travel: depot -> district = depot_to_district_freeflow_min, between stops = inter_stop_freeflow_min
    (0 between two orders at the same outlet). There are no coordinates in the data, so this replaces the
    (x_i, y_i) positions.

Hard constraints (a move that breaks one is never made)
  capacity (volume and weight), chilled -> reefer, van-only outlet -> van, home depot, at most two trips,
  booklet trip-time budgets (Fresh trips 270 min, Style + Tech trips 480 min per vehicle, trip time =
  outbound + inter-stop x (orders - 1) + handling), and the vehicle's remaining weekly fuel km.

Soft constraint
  Arrival after l_i costs late_penalty per minute (the relaxed P_tw term). Fresh trips start at 03:30 and
  Style/Tech trips at 08:00; a vehicle reloads (reload_min) between trips and waits if it is early.

Objective
  F(S) = sum_k ( fixed_cost * [k used] + fuel_cost * litres_k + late_penalty * late_minutes_k )
         + sum_{i in U} unassigned_penalty * (1 + history_weight * h_i)
  with litres_k = km_k / km_per_l and km of a trip = 2 x depot_to_district_km + inter_stop_km x (stops - 1).

Search: simulated-annealing ALNS with roulette-wheel operator choice and segment-wise weight updates.
  Destroy: random removal, Shaw (relatedness) removal, worst-cost removal.
  Repair:  greedy insertion, regret-k insertion, time-window regret insertion.
"""
import math
import random
from dataclasses import dataclass

DEFAULTS = dict(
    iterations=2000, seed=0,
    fixed_cost=20.0, fuel_cost=1.0, late_penalty=50.0,
    unassigned_penalty=1000.0, history_weight=0.5,
    fresh_start=210, other_start=480, reload_min=0,  # 03:30 and 08:00, minutes after midnight
    fresh_budget=270, other_budget=480,
    min_remove=2, max_remove=30, max_remove_frac=0.25,
    cooling_rate=0.995, start_temp_frac=0.05, reaction_factor=0.1, segment_length=50,
    sigma1=33, sigma2=13, sigma3=9,
    regret_k=3, tw_regret_weight=100.0, shaw_p=6, worst_p=3,
    shaw_district=9.0, shaw_brand=3.0, shaw_time=3.0, shaw_volume=2.0,
)


@dataclass(eq=False)
class Order:
    id: str
    outlet: str
    brand: str
    chilled: bool
    district: str
    depot: str
    w: float
    v: float
    s: float     # service (handling) minutes
    e: float     # window open, minutes after midnight
    l: float     # window close
    van_only: bool
    hist: float = 0.0  # recent deferrals at the outlet


@dataclass(eq=False)
class Vehicle:
    id: str
    type: str
    temp: str
    depot: str
    W: float
    V: float
    km_per_l: float
    km_left: float  # fuel range left this week


class Solution:
    __slots__ = ("routes", "vcost", "late", "U")

    def __init__(self, n_veh):
        self.routes = [[] for _ in range(n_veh)]  # vehicle -> list of trips, a trip is a list of order indices
        self.vcost = [0.0] * n_veh
        self.late = [0.0] * n_veh
        self.U = set()

    def copy(self):
        s = Solution(0)
        s.routes = [[t[:] for t in r] for r in self.routes]
        s.vcost, s.late, s.U = self.vcost[:], self.late[:], set(self.U)
        return s


class ALNS:
    def __init__(self, orders, vehicles, travel, prm=None):
        self.O, self.V, self.tr = orders, vehicles, travel
        self.p = dict(DEFAULTS, **(prm or {}))
        self.rng = random.Random(self.p["seed"])
        self.compat = [[k for k, veh in enumerate(vehicles)
                        if veh.depot == o.depot and (not o.chilled or veh.temp == "reefer")
                        and (not o.van_only or veh.type == "van")
                        and o.w <= veh.W and o.v <= veh.V] for o in orders]
        self.pen = [self.p["unassigned_penalty"] * (1 + self.p["history_weight"] * o.hist) for o in orders]
        self.max_v = max((o.v for o in orders), default=1.0) or 1.0
        self.destroy_ops = {"random": self.destroy_random, "shaw": self.destroy_shaw, "worst": self.destroy_worst}
        self.repair_ops = {"greedy": self.repair_greedy, "regret": self.repair_regret,
                           "tw_regret": self.repair_tw_regret}

    # ---- evaluation ---------------------------------------------------------------------------------
    def schedule(self, trips):
        """Trips in driving order: Fresh first (morning shift), then Style/Tech."""
        return sorted(trips, key=lambda t: self.O[t[0]].brand != "Fresh")

    def eval_vehicle(self, k, trips):
        """(cost, late minutes, arrival time per order) for vehicle k running these trips, or None if infeasible."""
        if not trips:
            return 0.0, 0.0, {}
        if len(trips) > 2:
            return None
        p, O, veh = self.p, self.O, self.V[k]
        km = late = fresh_min = other_min = 0.0
        clock, arr = None, {}
        for trip in self.schedule(trips):
            first = O[trip[0]]
            brand, dist = first.brand, first.district
            w = v = handling = 0.0
            for i in trip:
                o = O[i]
                if o.brand != brand or o.district != dist:
                    return None
                w += o.w
                v += o.v
                handling += o.s
            if w > veh.W + 1e-9 or v > veh.V + 1e-9:
                return None
            d = self.tr[dist]
            minutes = d["depot_to_district_freeflow_min"] + d["inter_stop_freeflow_min"] * (len(trip) - 1) + handling
            if brand == "Fresh":
                fresh_min += minutes
            else:
                other_min += minutes
            start = p["fresh_start"] if brand == "Fresh" else p["other_start"]
            t = (start if clock is None else max(start, clock + p["reload_min"])) + d["depot_to_district_freeflow_min"]
            prev = None
            for i in trip:
                o = O[i]
                if prev is not None and o.outlet != prev:
                    t += d["inter_stop_freeflow_min"]
                arr[i] = t
                if t > o.l:
                    late += t - o.l
                t = max(t, o.e) + o.s
                prev = o.outlet
            clock = t + d["depot_to_district_freeflow_min"]
            stops = len({O[i].outlet for i in trip})
            km += 2 * d["depot_to_district_km"] + d["inter_stop_km"] * (stops - 1)
        if fresh_min > p["fresh_budget"] + 1e-9 or other_min > p["other_budget"] + 1e-9:
            return None
        if km > veh.km_left + 1e-9:
            return None
        cost = p["fixed_cost"] + p["fuel_cost"] * km / veh.km_per_l + p["late_penalty"] * late
        return cost, late, arr

    def cost(self, sol):
        return sum(sol.vcost) + sum(self.pen[i] for i in sol.U)

    def refresh(self, sol, k):
        r = self.eval_vehicle(k, sol.routes[k])
        assert r is not None, "vehicle became infeasible"
        sol.vcost[k], sol.late[k] = r[0], r[1]

    def locate(self, sol):
        return {i: (k, ti) for k, r in enumerate(sol.routes) for ti, t in enumerate(r) for i in t}

    def remove(self, sol, i, where):
        k, ti = where[i]
        trip = sol.routes[k][ti]
        trip.remove(i)
        if not trip:
            del sol.routes[k][ti]
            for j, (kk, tj) in list(where.items()):  # trip indices after the deleted one shift down
                if kk == k and tj > ti:
                    where[j] = (kk, tj - 1)
        del where[i]
        self.refresh(sol, k)

    # ---- insertion ----------------------------------------------------------------------------------
    def best_in_vehicle(self, sol, i, k):
        """Cheapest feasible way to add order i to vehicle k: (delta cost, trip index or -1 for new, position, slack)."""
        o, trips, base = self.O[i], sol.routes[k], sol.vcost[k]
        best = None
        for ti, trip in enumerate(trips):
            f = self.O[trip[0]]
            if f.brand != o.brand or f.district != o.district:
                continue
            for pos in range(len(trip) + 1):
                new = [t if j != ti else t[:pos] + [i] + t[pos:] for j, t in enumerate(trips)]
                r = self.eval_vehicle(k, new)
                if r and (best is None or r[0] - base < best[0]):
                    best = (r[0] - base, ti, pos, o.l - r[2][i])
        if len(trips) < 2:
            r = self.eval_vehicle(k, trips + [[i]])
            if r and (best is None or r[0] - base < best[0]):
                best = (r[0] - base, -1, 0, o.l - r[2][i])
        return best

    def insert(self, sol, i, k, ti, pos):
        if ti == -1:
            sol.routes[k].append([i])
        else:
            sol.routes[k][ti].insert(pos, i)
        self.refresh(sol, k)

    def _repair(self, sol, pool, choose):
        """Insert orders one at a time; choose(pool, options) picks the next order (or None to stop)."""
        pool = list(pool)
        opts = {i: {k: self.best_in_vehicle(sol, i, k) for k in self.compat[i]} for i in pool}
        while pool:
            i = choose(pool, opts)
            if i is None:
                break
            k = min((k for k, b in opts[i].items() if b), key=lambda k: opts[i][k][0])
            _, ti, pos, _ = opts[i][k]
            self.insert(sol, i, k, ti, pos)
            pool.remove(i)
            for j in pool:  # only vehicle k changed
                if k in opts[j]:
                    opts[j][k] = self.best_in_vehicle(sol, j, k)
        sol.U |= set(pool)
        return sol

    def _sorted_costs(self, i, opts):
        return sorted(b[0] for b in opts[i].values() if b)

    def repair_greedy(self, sol, pool):
        def choose(pool, opts):
            best, best_c = None, None
            for i in pool:
                c = self._sorted_costs(i, opts)
                if c and c[0] < self.pen[i] and (best is None or c[0] < best_c):
                    best, best_c = i, c[0]
            return best
        return self._repair(sol, pool, choose)

    def repair_regret(self, sol, pool):
        kk = self.p["regret_k"]

        def choose(pool, opts):
            best, best_key = None, None
            for i in pool:
                c = self._sorted_costs(i, opts)
                if not c or c[0] >= self.pen[i]:
                    continue
                c += [self.pen[i]] * (kk - len(c))  # missing options cost as much as leaving it out
                key = (sum(c[h] - c[0] for h in range(1, kk)), -c[0])
                if best is None or key > best_key:
                    best, best_key = i, key
            return best
        return self._repair(sol, pool, choose)

    def repair_tw_regret(self, sol, pool):
        """Regret-2 plus urgency: orders whose window is nearly used up at their best position go first."""
        gamma = self.p["tw_regret_weight"]

        def choose(pool, opts):
            best, best_key = None, None
            for i in pool:
                feas = sorted((b for b in opts[i].values() if b), key=lambda b: b[0])
                if not feas or feas[0][0] >= self.pen[i]:
                    continue
                c1 = feas[0][0]
                c2 = feas[1][0] if len(feas) > 1 else self.pen[i]
                o = self.O[i]
                width = max(o.l - o.e, 1.0)
                urgency = 1 - min(max(feas[0][3] / width, 0.0), 1.0)
                key = (c2 - c1 + gamma * urgency, -c1)
                if best is None or key > best_key:
                    best, best_key = i, key
            return best
        return self._repair(sol, pool, choose)

    # ---- removal ------------------------------------------------------------------------------------
    def destroy_random(self, sol, n):
        where = self.locate(sol)
        chosen = self.rng.sample(list(where), min(n, len(where)))
        for i in chosen:
            self.remove(sol, i, where)
        return chosen

    def relatedness(self, i, j, where):
        a, b, p = self.O[i], self.O[j], self.p
        return (p["shaw_district"] * (a.district != b.district) + p["shaw_brand"] * (a.brand != b.brand)
                + p["shaw_time"] * abs(a.e - b.e) / 1440 + p["shaw_volume"] * abs(a.v - b.v) / self.max_v
                + (where.get(i) != where.get(j)))

    def destroy_shaw(self, sol, n):
        where = self.locate(sol)
        if not where:
            return []
        static = dict(where)  # trip membership before removal, for relatedness
        removed = [self.rng.choice(list(where))]
        left = [i for i in where if i != removed[0]]
        while len(removed) < n and left:
            r = self.rng.choice(removed)
            left.sort(key=lambda j: self.relatedness(r, j, static))
            idx = int(self.rng.random() ** self.p["shaw_p"] * len(left))
            removed.append(left.pop(idx))
        for i in removed:
            self.remove(sol, i, where)
        return removed

    def destroy_worst(self, sol, n):
        where = self.locate(sol)
        saving = {}
        for i, (k, ti) in where.items():
            trips = [t if j != ti else [x for x in t if x != i] for j, t in enumerate(sol.routes[k])]
            r = self.eval_vehicle(k, [t for t in trips if t])
            saving[i] = sol.vcost[k] - r[0]
        order = sorted(saving, key=lambda i: -saving[i])
        chosen = []
        while order and len(chosen) < n:
            idx = int(self.rng.random() ** self.p["worst_p"] * len(order))
            chosen.append(order.pop(idx))
        for i in chosen:
            self.remove(sol, i, where)
        return chosen

    # ---- main loop ----------------------------------------------------------------------------------
    def initial(self):
        sol = Solution(len(self.V))
        return self.repair_regret(sol, range(len(self.O)))  # sequential regret insertion

    def roulette(self, weights):
        total = sum(weights.values())
        x = self.rng.random() * total
        for op, w in weights.items():
            x -= w
            if x <= 0:
                return op
        return op

    def run(self, iterations=None, log=None):
        p = self.p
        iterations = p["iterations"] if iterations is None else iterations
        cur = self.initial()
        best, cur_c = cur, self.cost(cur)
        best_c = cur_c
        T = max(p["start_temp_frac"] * max(sum(cur.vcost), 1.0) / math.log(2), 1e-6)
        wd = {op: 1.0 for op in self.destroy_ops}
        wr = {op: 1.0 for op in self.repair_ops}
        sd, sr = {op: 0.0 for op in wd}, {op: 0.0 for op in wr}
        cd, cr = {op: 0 for op in wd}, {op: 0 for op in wr}
        history = [(0, cur_c, best_c, "", "", "initial")]
        n_assigned = len(self.O) - len(cur.U)
        for it in range(1, iterations + 1):
            d_op, r_op = self.roulette(wd), self.roulette(wr)
            hi = max(p["min_remove"], min(p["max_remove"], int(p["max_remove_frac"] * max(n_assigned, 1))))
            n_remove = self.rng.randint(p["min_remove"], hi)
            cand = cur.copy()
            removed = self.destroy_ops[d_op](cand, n_remove)
            pool = removed + list(cand.U)
            cand.U = set()
            self.repair_ops[r_op](cand, pool)
            cand_c = self.cost(cand)

            delta = cand_c - cur_c
            if delta < -1e-9 or self.rng.random() < math.exp(-delta / T):
                cur, cur_c = cand, cand_c
                n_assigned = len(self.O) - len(cur.U)
                if cand_c < best_c - 1e-9:
                    best, best_c, score, outcome = cand, cand_c, p["sigma1"], "best"
                elif delta < -1e-9:
                    score, outcome = p["sigma2"], "better"
                else:
                    score, outcome = p["sigma3"], "accepted"
            else:
                score, outcome = 0, "rejected"
            sd[d_op] += score
            sr[r_op] += score
            cd[d_op] += 1
            cr[r_op] += 1
            if it % p["segment_length"] == 0:
                for w, s, c in ((wd, sd, cd), (wr, sr, cr)):
                    for op in w:
                        if c[op]:
                            w[op] = (1 - p["reaction_factor"]) * w[op] + p["reaction_factor"] * s[op] / c[op]
                            s[op], c[op] = 0.0, 0
            T *= p["cooling_rate"]
            history.append((it, cur_c, best_c, d_op, r_op, outcome))
            if log and it % log == 0:
                print(f"  iter {it}: current {cur_c:,.1f}, best {best_c:,.1f}, unassigned {len(best.U)}")
        self.weights = {"destroy": wd, "repair": wr}
        return best, history

    # ---- output -------------------------------------------------------------------------------------
    def assignments(self, sol):
        """Per order: vehicle, trip number in driving order (1 or 2), arrival minute, late minutes."""
        out = {}
        for k, trips in enumerate(sol.routes):
            if not trips:
                continue
            arr = self.eval_vehicle(k, trips)[2]
            for n, trip in enumerate(self.schedule(trips), start=1):
                for i in trip:
                    out[i] = dict(vehicle_id=self.V[k].id, trip_id=n, arrival_min=arr[i],
                                  late_min=max(0.0, arr[i] - self.O[i].l))
        return out

    def trip_km(self, trip):
        d = self.tr[self.O[trip[0]].district]
        return 2 * d["depot_to_district_km"] + d["inter_stop_km"] * (len({self.O[i].outlet for i in trip}) - 1)


def hhmm_to_min(s):
    h, m = map(int, str(s).split(":"))
    return h * 60 + m


def min_to_hhmm(x):
    return f"{int(x) // 60:02d}:{int(x) % 60:02d}"
