"""Algorithm 1 (see ../algo-1.md): greedy, priority-ordered daily route assignment, back-tested on history.

Every operating day the planner gets that day's new orders plus the orders it deferred the day before,
and assigns them to vehicle-trips (two trips per vehicle per day) or defers them.

Interpretations of the spec (things algo-1.md leaves open):
  * Days / orders: deliveries_train.csv + task1_test_inputs.csv, planned on order_date. The historical
    dispatch_status is ignored; the planner makes its own decisions.
  * Fleet: all 60 vehicles are available every day (the history has no workshop data).
  * Fuel: each vehicle has weekly_range_km (km_per_l x weekly_fuel_quota_l), reset every ISO week.
    A trip's length is 2 x depot_to_district_km + inter_stop_km x (stops - 1); a trip is only allowed
    if the vehicle has that many km left this week.
  * Trips are time slots: trip 1 carries Fresh only, trip 2 can carry Fresh, Style or Tech. A vehicle
    may run trip 2 even if its trip 1 is empty.
  * A trip carries one district and one category (Fresh chilled, Fresh dry, Style or Tech). Chilled
    needs a reefer; reefers may carry dry. Van-only outlets can only be served by vans (this includes
    the Style and Tech van-only outlets, which the spec does not mention).
  * p = (times this order was deferred) x (deferrals at its outlet in the last OUTLET_DEFERRAL_WINDOW
    days). Every distinct p >= P_MIN is its own priority level, highest first; all orders with
    p < P_MIN form the last level.
  * "Smallest vehicle" = lowest weight capacity, then volume capacity; ties go to the vehicle with more
    fuel km left this week.
  * Delivery time windows and travel times are not modelled (the spec does not use them).

Writes <out>_decisions.csv (one row per order per planning day) and <out>_routes.csv (one row per
vehicle-trip used).
"""
import argparse
import itertools
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
# The challenge data lives in the repo root, at Cryptonovate_TBD/data.
DATA = HERE.parents[1] / "data"

UNCONFIRMED, DISTRICT_BRAND_CONFIRMED, ROUTE_LEGS_CONFIRMED = 0, 1, 2
STATE_NAME = {UNCONFIRMED: "UNCONFIRMED", DISTRICT_BRAND_CONFIRMED: "DISTRICT_BRAND_CONFIRMED",
              ROUTE_LEGS_CONFIRMED: "ROUTE_LEGS_CONFIRMED"}
FRESH = {"fresh_chilled", "fresh_dry"}
EXACT_PACK_MAX = 12  # exact subset search for van packing up to this many orders, greedy above


@dataclass(eq=False)
class Order:
    id: str
    order_date: str
    outlet: str
    brand: str
    cat: str
    district: str
    depot: str
    w: float
    v: float
    van_only: bool
    times_deferred: int = 0
    p: int = 0


@dataclass(eq=False)
class Vehicle:
    id: str
    type: str
    temp: str
    depot: str
    W: float
    V: float
    weekly_km: float
    used_week: float = 0.0


@dataclass(eq=False)
class Trip:
    veh: Vehicle
    slot: int
    state: int = UNCONFIRMED
    district: str = None
    cat: str = None
    orders: list = field(default_factory=list)
    w: float = 0.0
    v: float = 0.0


class DayPlanner:
    def __init__(self, vehicles, travel, prm):
        self.travel, self.prm = travel, prm
        self.trips = [Trip(veh, slot) for veh in vehicles for slot in (1, 2)]
        self.by_vehicle = defaultdict(list)
        for t in self.trips:
            self.by_vehicle[t.veh.id].append(t)

    # ---- distances, fuel and fit checks -------------------------------------------------------------
    def route_km(self, district, outlets):
        if not outlets:
            return 0.0
        d = self.travel[district]
        return 2 * d["depot_to_district_km"] + d["inter_stop_km"] * (len(outlets) - 1)

    def trip_km(self, trip):
        return self.route_km(trip.district, {o.outlet for o in trip.orders})

    def km_left(self, veh, excluding=None):
        """Fuel km this vehicle still has this week, after today's other trips."""
        today = sum(self.trip_km(t) for t in self.by_vehicle[veh.id] if t is not excluding and t.orders)
        return veh.weekly_km - veh.used_week - today

    @staticmethod
    def compatible(trip, o):
        veh = trip.veh
        if o.depot != veh.depot:
            return False
        if o.cat == "fresh_chilled" and veh.temp != "reefer":
            return False
        if o.van_only and veh.type != "van":
            return False
        if trip.slot == 1 and o.cat not in FRESH:
            return False
        return True

    def fits(self, trip, orders):
        if trip.state == ROUTE_LEGS_CONFIRMED or not orders:
            return False
        district, cat = (trip.district, trip.cat) if trip.orders else (orders[0].district, orders[0].cat)
        for o in orders:
            if o.district != district or o.cat != cat or not self.compatible(trip, o):
                return False
        if trip.w + sum(o.w for o in orders) > trip.veh.W + 1e-9:
            return False
        if trip.v + sum(o.v for o in orders) > trip.veh.V + 1e-9:
            return False
        outlets = {o.outlet for o in trip.orders} | {o.outlet for o in orders}
        return self.route_km(district, outlets) <= self.km_left(trip.veh, excluding=trip) + 1e-9

    def assign(self, trip, orders, state):
        if not trip.orders:
            trip.district, trip.cat = orders[0].district, orders[0].cat
        trip.orders.extend(orders)
        trip.w += sum(o.w for o in orders)
        trip.v += sum(o.v for o in orders)
        trip.state = max(trip.state, state)

    @staticmethod
    def util(trip, orders=()):
        return (trip.w + sum(o.w for o in orders)) / trip.veh.W, (trip.v + sum(o.v for o in orders)) / trip.veh.V

    # ---- candidate vehicle-trips --------------------------------------------------------------------
    def free(self, depot, slots, temps=None, types=None):
        """Unused trips (state UNCONFIRMED) of the depot's vehicles in the given slots."""
        return [t for t in self.trips if t.state == UNCONFIRMED and not t.orders and t.veh.depot == depot
                and t.slot in slots and (temps is None or t.veh.temp in temps)
                and (types is None or t.veh.type in types)]

    def size_key(self, trip):
        return trip.veh.W, trip.veh.V, -self.km_left(trip.veh)

    def smallest_fitting(self, cands, orders):
        for t in sorted(cands, key=self.size_key):
            if self.fits(t, orders):
                return t
        return None

    # ---- packing ------------------------------------------------------------------------------------
    def best_subset(self, trip, orders):
        """The subset that fills the trip best (highest weight or volume share). Exact for small sets."""
        if len(orders) <= EXACT_PACK_MAX:
            best, best_score = [], -1.0
            for r in range(len(orders), 0, -1):
                for combo in itertools.combinations(orders, r):
                    combo = list(combo)
                    if self.fits(trip, combo):
                        score = max(self.util(trip, combo))
                        if score > best_score + 1e-12:
                            best, best_score = combo, score
            return best
        chosen = []
        for o in sorted(orders, key=lambda o: -o.v):
            if self.fits(trip, chosen + [o]):
                chosen.append(o)
        return chosen

    def split_pick(self, cands, orders):
        """Smallest vehicle that reaches a sufficient weight OR volume share with the fewest orders
        (largest orders first); if none reaches it, the vehicle with the best share."""
        sw, sv = self.prm["SUFFICIENT_WEIGHT_UTIL"], self.prm["SUFFICIENT_VOLUME_UTIL"]
        best = None
        for t in sorted(cands, key=self.size_key):
            chosen = []
            for o in sorted(orders, key=lambda o: -max(o.w / t.veh.W, o.v / t.veh.V)):
                if self.fits(t, chosen + [o]):
                    chosen.append(o)
                    uw, uv = self.util(t, chosen)
                    if uw >= sw or uv >= sv:
                        return t, chosen
            if chosen:
                score = max(self.util(t, chosen))
                if best is None or score > best[2]:
                    best = (t, chosen, score)
        return (best[0], best[1]) if best else None

    # ---- steps --------------------------------------------------------------------------------------
    def top_up(self, orders, cats=None):
        """Add orders (smallest first) to open DISTRICT_BRAND_CONFIRMED trips of the same district and category."""
        left = list(orders)
        for t in self.trips:
            if t.state != DISTRICT_BRAND_CONFIRMED:
                continue
            if cats and t.cat not in cats:
                continue
            for o in sorted([o for o in left if o.district == t.district and o.cat == t.cat], key=lambda o: o.v):
                if self.fits(t, [o]):
                    self.assign(t, [o], DISTRICT_BRAND_CONFIRMED)
                    left.remove(o)
        return left

    def serve_van_only(self, orders, cand_groups):
        """Van-only orders of one district: one van if it can take them all (the one with the most fuel
        km left), otherwise pack vans one by one; move to the next candidate group for leftovers."""
        left = list(orders)
        for make in cand_groups:
            if not left:
                break
            cands = make()
            fitting = [t for t in cands if self.fits(t, left)]
            if fitting:
                t = max(fitting, key=lambda t: self.km_left(t.veh))
                self.assign(t, left, DISTRICT_BRAND_CONFIRMED)
                return []
            for t in sorted(cands, key=lambda t: -self.km_left(t.veh)):
                if not left:
                    break
                chosen = self.best_subset(t, left)
                if chosen:
                    self.assign(t, chosen, DISTRICT_BRAND_CONFIRMED)
                    left = [o for o in left if o not in chosen]
        return left

    def serve_district(self, orders, first_cands, more_cands):
        """Truck-servable orders of one district and category (see spec: whole district into the smallest
        vehicle that fits; otherwise split off loads that reach a sufficient share)."""
        left = list(orders)
        t = self.smallest_fitting(first_cands(), left)
        if t:
            self.assign(t, left, DISTRICT_BRAND_CONFIRMED)
            return []
        make = first_cands
        while left:
            pick = self.split_pick(make(), left)
            if pick is None and make is first_cands:
                make = more_cands  # no first-choice trip left: fall back to any available trip
                pick = self.split_pick(make(), left)
            if pick is None:
                return left
            t, chosen = pick
            self.assign(t, chosen, ROUTE_LEGS_CONFIRMED)
            left = [o for o in left if o not in chosen]
            make = more_cands
            t = self.smallest_fitting(make(), left) if left else None
            if t:
                self.assign(t, left, DISTRICT_BRAND_CONFIRMED)
                return []
        return []

    def step_van_only(self, orders, cat, cand_groups):
        mine = [o for o in orders if o.cat == cat and o.van_only]
        rest = [o for o in orders if not (o.cat == cat and o.van_only)]
        groups = defaultdict(list)
        for o in mine:
            groups[(o.depot, o.district)].append(o)
        for (depot, _), group in groups.items():
            rest += self.serve_van_only(group, [lambda g=g, d=depot: g(d) for g in cand_groups])
        return rest

    def step_trucks(self, orders, cat, first, more):
        rest = self.top_up(orders, cats={cat})  # fill vans already confirmed for this district first
        mine = [o for o in rest if o.cat == cat and not o.van_only]
        rest = [o for o in rest if not (o.cat == cat and not o.van_only)]
        groups = defaultdict(list)
        for o in mine:
            groups[(o.depot, o.district)].append(o)
        # farthest district first
        for (depot, district) in sorted(groups, key=lambda k: -self.travel[k[1]]["depot_to_district_km"]):
            rest += self.serve_district(groups[(depot, district)], lambda d=depot: first(d), lambda d=depot: more(d))
        return rest

    def confirm(self, lower):
        """Close open trips whose district-category has no lower-priority orders left and that are full enough."""
        sw, sv = self.prm["SUFFICIENT_WEIGHT_UTIL"], self.prm["SUFFICIENT_VOLUME_UTIL"]
        waiting = {(o.depot, o.district, o.cat) for o in lower}
        for t in self.trips:
            if t.state == DISTRICT_BRAND_CONFIRMED and (t.veh.depot, t.district, t.cat) not in waiting:
                uw, uv = self.util(t)
                if uw > sw and uv > sv:
                    t.state = ROUTE_LEGS_CONFIRMED

    # ---- one day ------------------------------------------------------------------------------------
    def levels(self, orders):
        pmin = self.prm["P_MIN"]
        high = sorted({o.p for o in orders if o.p >= pmin}, reverse=True)
        out = [[o for o in orders if o.p == p] for p in high]
        low = [o for o in orders if o.p < pmin]
        if low:
            out.append(low)
        return out

    def plan(self, orders):
        f = self.free
        reefer_vans = lambda slot: (lambda d: f(d, {slot}, temps={"reefer"}, types={"van"}))
        amb_vans = lambda slot: (lambda d: f(d, {slot}, temps={"ambient"}, types={"van"}))
        deferred = []
        levels = self.levels(orders)
        for i, lvl in enumerate(levels):
            lower = [o for l in levels[i + 1:] for o in l]
            rest = self.top_up(lvl)
            # 1. Fresh chilled, van-only outlets: reefer vans, trip 1 then trip 2
            rest = self.step_van_only(rest, "fresh_chilled", [reefer_vans(1), reefer_vans(2)])
            # 2. Fresh chilled, other outlets: reefer vehicles, trip 1; leftovers may use trip 2
            rest = self.step_trucks(rest, "fresh_chilled",
                                    first=lambda d: f(d, {1}, temps={"reefer"}),
                                    more=lambda d: f(d, {1, 2}, temps={"reefer"}))
            # 3. Fresh dry, van-only outlets: ambient vans, then trip 2 of any van (reefer vans after chilled)
            rest = self.step_van_only(rest, "fresh_dry",
                                      [amb_vans(1), lambda d: f(d, {2}, types={"van"})])
            # 4. Fresh dry, other outlets: ambient trip 1 plus reefer trip 2; leftovers any ambient trip too
            rest = self.step_trucks(rest, "fresh_dry",
                                    first=lambda d: f(d, {1}, temps={"ambient"}) + f(d, {2}, temps={"reefer"}),
                                    more=lambda d: f(d, {1, 2}, temps={"ambient"}) + f(d, {2}, temps={"reefer"}))
            # 5. Style and Tech: trip 2 only (van-only outlets on vans)
            for cat in ("style", "tech"):
                rest = self.step_van_only(rest, cat, [lambda d: f(d, {2}, types={"van"})])
                rest = self.step_trucks(rest, cat, first=lambda d: f(d, {2}), more=lambda d: f(d, {2}))
            deferred += rest  # no vehicle could take them at this priority
            self.confirm(lower)
        for t in self.trips:
            if t.orders:
                t.state = ROUTE_LEGS_CONFIRMED
        return deferred


def load(data=DATA):
    orders = pd.concat([pd.read_csv(data / "Training Data/deliveries_train.csv"),
                        pd.read_csv(data / "Test Data/task1_test_inputs.csv")], ignore_index=True)
    outlets = pd.read_csv(data / "General Data/outlets.csv").set_index("outlet_id")
    vehicles = pd.read_csv(data / "General Data/vehicles.csv")
    if "weekly_range_km" not in vehicles:
        vehicles["weekly_range_km"] = vehicles.km_per_l * vehicles.weekly_fuel_quota_l
    travel = pd.read_csv(data / "General Data/district_travel.csv").set_index("district").to_dict("index")
    van_only = outlets.parking_constraint.eq("van_only")
    cat = orders.brand.str.lower().where(orders.brand != "Fresh",
                                         "fresh_" + orders.temp_requirement.map({"chilled": "chilled",
                                                                                  "ambient": "dry"}))
    order_objs = [Order(r.delivery_id, r.order_date, r.outlet_id, r.brand, c, r.district, r.depot,
                        r.order_weight_kg, r.order_volume_m3, bool(van_only[r.outlet_id]))
                  for r, c in zip(orders.itertuples(), cat)]
    veh_objs = [Vehicle(r.vehicle_id, r.type, r.temp, r.depot, r.weight_cap_kg, r.volume_cap_m3,
                        r.weekly_range_km) for r in vehicles.itertuples()]
    return order_objs, veh_objs, travel


def run(prm, out_prefix):
    orders, vehicles, travel = load()
    by_date = defaultdict(list)
    for o in orders:
        by_date[o.order_date].append(o)
    dates = sorted(by_date)

    outlet_deferrals = defaultdict(deque)  # outlet -> dates of past deferrals
    window = pd.Timedelta(days=prm["OUTLET_DEFERRAL_WINDOW"])
    pending, week, decisions, routes = [], None, [], []
    for date in dates:
        day = pd.Timestamp(date)
        if day.isocalendar()[:2] != week:  # new fuel week
            week = day.isocalendar()[:2]
            for v in vehicles:
                v.used_week = 0.0
        todays = pending + by_date[date]
        for o in todays:
            hist = outlet_deferrals[o.outlet]
            while hist and hist[0] < day - window:
                hist.popleft()
            o.p = o.times_deferred * len(hist)

        planner = DayPlanner(vehicles, travel, prm)
        deferred = planner.plan(todays)
        deferred_ids = {id(o) for o in deferred}

        where = {}
        for t in planner.trips:
            if not t.orders:
                continue
            km = planner.trip_km(t)
            route_id = f"{date}-{t.veh.id}-T{t.slot}"
            uw, uv = planner.util(t)
            routes.append(dict(plan_date=date, route_id=route_id, depot=t.veh.depot, vehicle_id=t.veh.id,
                               vehicle_type=t.veh.type, vehicle_temp=t.veh.temp, trip_id=t.slot,
                               district=t.district, category=t.cat, orders=len(t.orders),
                               stops=len({o.outlet for o in t.orders}), weight_kg=round(t.w, 1),
                               volume_m3=round(t.v, 3), weight_util=round(uw, 4), volume_util=round(uv, 4),
                               km=round(km, 1), final_state=STATE_NAME[t.state]))
            for o in t.orders:
                where[id(o)] = (t.veh.id, t.slot, route_id)
        for t in planner.trips:  # the day's km count against the weekly fuel quota
            if t.orders:
                t.veh.used_week += planner.trip_km(t)

        for o in todays:
            served = id(o) not in deferred_ids
            veh, slot, route_id = where.get(id(o), ("", "", ""))
            decisions.append(dict(plan_date=date, delivery_id=o.id, order_date=o.order_date, outlet_id=o.outlet,
                                  brand=o.brand, category=o.cat, district=o.district, depot=o.depot,
                                  van_only=o.van_only, weight_kg=o.w, volume_m3=o.v,
                                  times_deferred_before=o.times_deferred, p=o.p,
                                  decision="served" if served else "deferred",
                                  vehicle_id=veh, trip_id=slot, route_id=route_id))
        for o in deferred:
            o.times_deferred += 1
            outlet_deferrals[o.outlet].append(day)
        pending = deferred

    dec = pd.DataFrame(decisions)
    rts = pd.DataFrame(routes)
    dec.to_csv(f"{out_prefix}_decisions.csv", index=False)
    rts.to_csv(f"{out_prefix}_routes.csv", index=False)
    print(f"{len(dates)} days, {len(orders):,} orders -> {len(dec):,} decisions "
          f"({(dec.decision == 'deferred').sum():,} deferrals), {len(rts):,} vehicle-trips; "
          f"{len(pending)} orders still pending at the end")
    print(f"wrote {out_prefix}_decisions.csv and {out_prefix}_routes.csv")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--p-min", type=int, default=1)
    ap.add_argument("--outlet-deferral-window", type=int, default=7, help="days")
    ap.add_argument("--sufficient-weight-util", type=float, default=0.8)
    ap.add_argument("--sufficient-volume-util", type=float, default=0.8)
    ap.add_argument("--out", default=str(HERE / "results" / "algo1"), help="output path prefix")
    a = ap.parse_args()
    prm = dict(P_MIN=a.p_min, OUTLET_DEFERRAL_WINDOW=a.outlet_deferral_window,
               SUFFICIENT_WEIGHT_UTIL=a.sufficient_weight_util, SUFFICIENT_VOLUME_UTIL=a.sufficient_volume_util)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    print("hyperparameters:", prm)
    run(prm, a.out)


if __name__ == "__main__":
    main()
