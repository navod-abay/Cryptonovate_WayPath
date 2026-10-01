"""Run algorithm 1 (algo1.py) on the Task 2B peak-day scenario and check the result against the booklet rules.

Inputs: Test Data/task2b_peak_day_scenarios.csv, Test Data/task2b_peak_day_fleet.csv (only vehicles marked
available are used), General Data/vehicles.csv, district_travel.csv, service_allowance.csv.

Mapping the scenario onto algo1's inputs:
  * times deferred = deferred_yesterday; the scenario has no outlet deferral history, so
    p = deferred_yesterday x days_since_last_served.
  * Every available vehicle starts with its full weekly fuel range (the scenario gives no usage so far).
  * algo1 treats trip 1 as Fresh-only and trip 2 as any brand. In the submission, a vehicle that only runs
    trip 2 has it renumbered to trip 1.

The allocation is run through algo1's DayPlanner unchanged, then checked against feasibility rules 1-7 of
the booklet, including the trip-time budgets (Fresh 270 min, Style + Tech 480 min per vehicle), which algo1
itself does not model.

Writes results/task2b_algo1_submission.csv (template format), results/task2b_algo1_trips.csv and
results/task2b_algo1_report.md.
"""
import argparse
from collections import defaultdict
from pathlib import Path

import pandas as pd

from algo1 import DATA, DayPlanner, Order, Vehicle

HERE = Path(__file__).resolve().parent
OUT = HERE / "results"
BUDGET = {"Fresh": 270, "Style": 480, "Tech": 480}  # minutes per vehicle; Style and Tech share one budget


def load_scenario(scenario):
    s = pd.read_csv(DATA / "Test Data/task2b_peak_day_scenarios.csv")
    s = s[s.scenario == scenario].reset_index(drop=True)
    fleet = pd.read_csv(DATA / "Test Data/task2b_peak_day_fleet.csv")
    fleet = fleet[fleet.scenario == scenario]
    vehicles = pd.read_csv(DATA / "General Data/vehicles.csv")
    if "weekly_range_km" not in vehicles:
        vehicles["weekly_range_km"] = vehicles.km_per_l * vehicles.weekly_fuel_quota_l
    vehicles = vehicles.merge(fleet, on="vehicle_id")
    travel = pd.read_csv(DATA / "General Data/district_travel.csv").set_index("district")
    service = pd.read_csv(DATA / "General Data/service_allowance.csv").set_index(["brand", "dock_type"])
    return s, vehicles, travel, service


def to_objects(s, vehicles):
    orders = []
    for r in s.itertuples():
        cat = r.brand.lower() if r.brand != "Fresh" else ("fresh_chilled" if r.temp_requirement == "chilled"
                                                          else "fresh_dry")
        o = Order(r.order_ref, "scenario", r.outlet_id, r.brand, cat, r.district, r.depot,
                  r.order_weight_kg, r.order_volume_m3, r.parking_constraint == "van_only",
                  times_deferred=int(r.deferred_yesterday))
        o.p = int(r.deferred_yesterday) * int(r.days_since_last_served)
        orders.append(o)
    avail = vehicles[vehicles.status == "available"]
    vehs = [Vehicle(r.vehicle_id, r.type, r.temp, r.depot, r.weight_cap_kg, r.volume_cap_m3, r.weekly_range_km)
            for r in avail.itertuples()]
    return orders, vehs


def trip_minutes(rows, travel, service):
    """Booklet trip time: outbound + inter-stop x (orders - 1) + handling per order."""
    t = travel.loc[rows.district.iloc[0]]
    handling = sum(service.loc[(b, d), "service_allowance_min"] for b, d in zip(rows.brand, rows.dock_type))
    return t.depot_to_district_freeflow_min + t.inter_stop_freeflow_min * (len(rows) - 1) + handling


def check(sub, s, vehicles, travel, service):
    """Feasibility rules 1-7 from the booklet. Returns (violations, per-trip table)."""
    v = vehicles.set_index("vehicle_id")
    served = sub[sub.decision == "served"].merge(
        s[["order_ref", "brand", "district", "depot", "dock_type", "parking_constraint", "temp_requirement",
           "order_weight_kg", "order_volume_m3"]], on="order_ref")
    bad = []
    if served.order_ref.duplicated().any():
        bad.append("rule 5: an order is assigned more than once")
    trips = []
    for (veh, trip), rows in served.groupby(["vehicle_id", "trip_id"]):
        car = v.loc[veh]
        tag = f"{veh} trip {trip}"
        if car.status != "available":
            bad.append(f"{tag}: vehicle is {car.status}")
        if rows.brand.nunique() > 1 or rows.district.nunique() > 1:
            bad.append(f"rule 1: {tag} mixes brands or districts")
        if (rows.temp_requirement == "chilled").any() and car.temp != "reefer":
            bad.append(f"rule 2: {tag} carries chilled orders on an ambient vehicle")
        if (rows.parking_constraint == "van_only").any() and car.type != "van":
            bad.append(f"rule 3: {tag} serves a van-only outlet with a {car.type}")
        if (rows.depot != car.depot).any():
            bad.append(f"rule 4: {tag} serves another depot's outlets")
        w, vol = rows.order_weight_kg.sum(), rows.order_volume_m3.sum()
        if w > car.weight_cap_kg + 1e-9 or vol > car.volume_cap_m3 + 1e-9:
            bad.append(f"rule 6: {tag} over capacity ({w:,.0f}/{car.weight_cap_kg:,} kg, "
                       f"{vol:.2f}/{car.volume_cap_m3} m³)")
        trips.append(dict(vehicle_id=veh, trip_id=trip, vehicle_type=car.type, vehicle_temp=car.temp,
                          brand=rows.brand.iloc[0], district=rows.district.iloc[0], orders=len(rows),
                          chilled_orders=int((rows.temp_requirement == "chilled").sum()),
                          weight_kg=round(w, 1), weight_util=round(w / car.weight_cap_kg, 3),
                          volume_m3=round(vol, 3), volume_util=round(vol / car.volume_cap_m3, 3),
                          minutes=int(trip_minutes(rows, travel, service))))
    trips = pd.DataFrame(trips)
    if not trips.empty:
        for veh, rows in trips.groupby("vehicle_id"):
            if len(rows) > 2 or sorted(rows.trip_id) not in ([1], [1, 2]):
                bad.append(f"rule 7: {veh} has trips {sorted(rows.trip_id)} (at most two, numbered 1 and 2)")
            fresh = rows.loc[rows.brand == "Fresh", "minutes"].sum()
            other = rows.loc[rows.brand != "Fresh", "minutes"].sum()
            if fresh > BUDGET["Fresh"]:
                bad.append(f"rule 7: {veh} Fresh trips take {fresh} min (budget 270)")
            if other > BUDGET["Style"]:
                bad.append(f"rule 7: {veh} Style/Tech trips take {other} min (budget 480)")
    return bad, trips


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--scenario", default="S1")
    ap.add_argument("--p-min", type=int, default=1)
    ap.add_argument("--sufficient-weight-util", type=float, default=0.8)
    ap.add_argument("--sufficient-volume-util", type=float, default=0.8)
    a = ap.parse_args()
    prm = dict(P_MIN=a.p_min, OUTLET_DEFERRAL_WINDOW=7,
               SUFFICIENT_WEIGHT_UTIL=a.sufficient_weight_util, SUFFICIENT_VOLUME_UTIL=a.sufficient_volume_util)

    s, vehicles, travel, service = load_scenario(a.scenario)
    orders, vehs = to_objects(s, vehicles)
    planner = DayPlanner(vehs, travel.to_dict("index"), prm)
    deferred = {o.id for o in planner.plan(orders)}

    # Submission rows; a vehicle that only runs algo1's trip 2 gets it renumbered to trip 1.
    used = defaultdict(list)
    for t in planner.trips:
        if t.orders:
            used[t.veh.id].append(t)
    placed = {}
    for veh, ts in used.items():
        for n, t in enumerate(sorted(ts, key=lambda t: t.slot), start=1):
            for o in t.orders:
                placed[o.id] = (veh, n)
    sub = pd.DataFrame([dict(scenario=a.scenario, order_ref=r.order_ref, outlet_id=r.outlet_id,
                             decision="deferred" if r.order_ref in deferred else "served",
                             vehicle_id=placed.get(r.order_ref, ("", ""))[0],
                             trip_id=placed.get(r.order_ref, ("", ""))[1]) for r in s.itertuples()])
    OUT.mkdir(exist_ok=True)
    sub.to_csv(OUT / f"task2b_algo1_submission.csv", index=False)

    violations, trips = check(sub, s, vehicles, travel, service)
    trips.sort_values(["vehicle_id", "trip_id"]).to_csv(OUT / "task2b_algo1_trips.csv", index=False)

    # Report
    s = s.assign(decision=sub.decision, category=[o.cat for o in orders], p=[o.p for o in orders])
    by_cat = s.groupby("category").agg(orders=("order_ref", "size"),
                                       served=("decision", lambda x: (x == "served").sum()),
                                       weight_kg=("order_weight_kg", "sum"), volume_m3=("order_volume_m3", "sum"))
    by_cat = by_cat.astype({"orders": int, "served": int})
    by_cat["deferred"] = by_cat.orders - by_cat.served
    avail = vehicles[vehicles.status == "available"]
    reefers = avail[avail.temp == "reefer"]
    lines = [f"# Algorithm 1 on Task 2B scenario {a.scenario}", "",
             f"Hyperparameters: {prm}", "",
             f"Available vehicles: {len(avail)} of {len(vehicles)} "
             f"({len(reefers)} reefers: {', '.join(f'{r.vehicle_id} {r.type} {r.volume_cap_m3} m³' for r in reefers.itertuples())})",
             "", "## Outcome", "",
             f"Served {int((sub.decision == 'served').sum())} of {len(sub)} orders; "
             f"deferred {int((sub.decision == 'deferred').sum())}. "
             f"Vehicles used: {sub.loc[sub.decision == 'served', 'vehicle_id'].nunique()}, trips: {len(trips)}.", "",
             "| Category | Orders | Served | Deferred | Weight (kg) | Volume (m³) |", "|---|---|---|---|---|---|"]
    lines += [f"| {r.Index} | {r.orders} | {r.served} | {r.deferred} | {r.weight_kg:,.0f} | {r.volume_m3:,.1f} |"
              for r in by_cat.itertuples()]
    d = s[s.decision == "deferred"]
    lines += ["", "## Deferred orders", ""]
    if d.empty:
        lines.append("None.")
    else:
        lines += ["| order_ref | Outlet | Category | District | Van only | Weight (kg) | Volume (m³) | p |",
                  "|---|---|---|---|---|---|---|---|"]
        lines += [f"| {r.order_ref} | {r.outlet_id} | {r.category} | {r.district} | "
                  f"{'yes' if r.parking_constraint == 'van_only' else ''} | {r.order_weight_kg:,.0f} | "
                  f"{r.order_volume_m3:.2f} | {r.p} |" for r in d.sort_values(["category", "district"]).itertuples()]
    lines += ["", "## Feasibility check (booklet rules 1-7)", ""]
    lines += ["All rules pass."] if not violations else [f"{len(violations)} violations:", ""] + [f"- {x}" for x in violations]
    report = "\n".join(lines) + "\n"
    (OUT / "task2b_algo1_report.md").write_text(report)
    print(report)
    print("wrote results/task2b_algo1_submission.csv, task2b_algo1_trips.csv, task2b_algo1_report.md")


if __name__ == "__main__":
    main()
