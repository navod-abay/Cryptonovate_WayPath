"""Back-test the ALNS (alns.py) day by day on the historical orders.

Each operating day the ALNS plans that day's new orders plus the ones it deferred the day before, for both
depots and the full fleet (the history has no workshop data). Per day:
  * h_i = deferrals at the order's outlet in the last 30 days (the "past month" attribute);
  * each vehicle's fuel range is what is left of its weekly range (reset every ISO week);
  * time windows, service times and trip budgets as in alns.py.

Writes <out>_decisions.csv and <out>_routes.csv in the same format as algorithm 1, so
../algo1/assess_algo.py can score it.

Usage: python backtest.py [--start 2026-02-16] [--end 2026-03-28] [--iterations 300]
"""
import argparse
import time
from collections import defaultdict, deque
from pathlib import Path

import pandas as pd

from alns import ALNS, Order, Vehicle, hhmm_to_min

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "data"


def read(path):
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()  # tolerate stray spaces in a header
    return df


def load():
    orders = pd.concat([read(DATA / "Training Data/deliveries_train.csv"),
                        read(DATA / "Test Data/task1_test_inputs.csv")], ignore_index=True)
    outlets = read(DATA / "General Data/outlets.csv").set_index("outlet_id")
    vehicles = read(DATA / "General Data/vehicles.csv")
    if "weekly_range_km" not in vehicles:
        vehicles["weekly_range_km"] = vehicles.km_per_l * vehicles.weekly_fuel_quota_l
    travel = read(DATA / "General Data/district_travel.csv").set_index("district").to_dict("index")
    service = read(DATA / "General Data/service_allowance.csv").set_index(["brand", "dock_type"]).service_allowance_min
    return orders, outlets, vehicles, travel, service


def category(o):
    return ("fresh_chilled" if o.chilled else "fresh_dry") if o.brand == "Fresh" else o.brand.lower()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--start", default="2026-02-16")
    ap.add_argument("--end", default="2026-03-28")
    ap.add_argument("--iterations", type=int, default=300, help="ALNS iterations per day")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=str(HERE / "results" / "alns"))
    a = ap.parse_args()

    raw, outlets, vehicles, travel, service = load()
    raw = raw[(raw.order_date >= a.start) & (raw.order_date <= a.end)]
    by_date = defaultdict(list)
    for r in raw.itertuples():
        out = outlets.loc[r.outlet_id]
        by_date[r.order_date].append(dict(
            order=Order(r.delivery_id, r.outlet_id, r.brand, r.temp_requirement == "chilled", r.district, r.depot,
                        r.order_weight_kg, r.order_volume_m3, service[(r.brand, out.dock_type)],
                        hhmm_to_min(out.window_open_time), hhmm_to_min(out.window_close_time),
                        out.parking_constraint == "van_only"),
            order_date=r.order_date, times_deferred=0))
    dates = sorted(by_date)
    week_used = {v: 0.0 for v in vehicles.vehicle_id}
    outlet_deferrals = defaultdict(deque)
    pending, week, decisions, routes = [], None, [], []
    t_start = time.time()

    for n, date in enumerate(dates, 1):
        day = pd.Timestamp(date)
        if day.isocalendar()[:2] != week:
            week = day.isocalendar()[:2]
            week_used = {v: 0.0 for v in week_used}
        todays = pending + by_date[date]
        for item in todays:
            hist = outlet_deferrals[item["order"].outlet]
            while hist and hist[0] < day - pd.Timedelta(days=30):
                hist.popleft()
            item["order"].hist = len(hist)
        vehs = [Vehicle(r.vehicle_id, r.type, r.temp, r.depot, r.weight_cap_kg, r.volume_cap_m3, r.km_per_l,
                        r.weekly_range_km - week_used[r.vehicle_id]) for r in vehicles.itertuples()]
        alns = ALNS([it["order"] for it in todays], vehs, travel, dict(iterations=a.iterations, seed=a.seed + n))
        best, _ = alns.run()
        asg = alns.assignments(best)

        for k, trips in enumerate(best.routes):
            for t_no, trip in enumerate(alns.schedule(trips), start=1):
                os_ = [alns.O[i] for i in trip]
                veh = vehs[k]
                km = alns.trip_km(trip)
                week_used[veh.id] += km
                cats = {category(o) for o in os_}
                w, v = sum(o.w for o in os_), sum(o.v for o in os_)
                routes.append(dict(plan_date=date, route_id=f"{date}-{veh.id}-T{t_no}", depot=veh.depot,
                                   vehicle_id=veh.id, vehicle_type=veh.type, vehicle_temp=veh.temp, trip_id=t_no,
                                   district=os_[0].district, category=cats.pop() if len(cats) == 1 else "fresh_mixed",
                                   orders=len(trip), stops=len({o.outlet for o in os_}), weight_kg=round(w, 1),
                                   volume_m3=round(v, 3), weight_util=round(w / veh.W, 4),
                                   volume_util=round(v / veh.V, 4), km=round(km, 1),
                                   late_min=round(sum(asg[i]["late_min"] for i in trip), 1)))
        deferred = []
        for i, item in enumerate(todays):
            o = item["order"]
            served = i in asg
            decisions.append(dict(plan_date=date, delivery_id=o.id, order_date=item["order_date"], outlet_id=o.outlet,
                                  brand=o.brand, category=category(o), district=o.district, depot=o.depot,
                                  van_only=o.van_only, weight_kg=o.w, volume_m3=o.v,
                                  times_deferred_before=item["times_deferred"], p=o.hist,
                                  decision="served" if served else "deferred",
                                  vehicle_id=asg[i]["vehicle_id"] if served else "",
                                  trip_id=asg[i]["trip_id"] if served else "",
                                  route_id=f"{date}-{asg[i]['vehicle_id']}-T{asg[i]['trip_id']}" if served else "",
                                  late_min=round(asg[i]["late_min"], 1) if served else ""))
            if not served:
                item["times_deferred"] += 1
                outlet_deferrals[o.outlet].append(day)
                deferred.append(item)
        pending = deferred
        if n % 5 == 0 or n == len(dates):
            print(f"  {date}: day {n}/{len(dates)}, {len(todays)} orders, {len(deferred)} deferred "
                  f"({time.time() - t_start:.0f} s)")

    dec, rts = pd.DataFrame(decisions), pd.DataFrame(routes)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    dec.to_csv(f"{a.out}_decisions.csv", index=False)
    rts.to_csv(f"{a.out}_routes.csv", index=False)
    late = dec[(dec.decision == "served") & (pd.to_numeric(dec.late_min, errors="coerce") > 0)]
    print(f"{len(dates)} days, {raw.shape[0]:,} orders: {(dec.decision == 'deferred').sum():,} deferrals, "
          f"{len(pending)} still pending, {len(late):,} late deliveries; {len(rts):,} vehicle-trips")
    print(f"wrote {a.out}_decisions.csv and {a.out}_routes.csv")


if __name__ == "__main__":
    main()
