"""Run the ALNS (alns.py) on the Task 2B peak-day scenario, check it against the booklet rules and compare it
with algorithm 1.

Scenario mapping: only vehicles marked available are used, each with its full weekly fuel range; the outlet's
recent deferrals h_i = deferred_yesterday x days_since_last_served (same as algorithm 1's p).

Writes results/task2b_alns_submission.csv (template format), task2b_alns_trips.csv, task2b_alns_history.csv,
task2b_alns_convergence.png and task2b_alns_report.md.
"""
import argparse
import sys
import time
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

from alns import ALNS, DEFAULTS, Order, Vehicle, hhmm_to_min, min_to_hhmm

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "algo1"))
from task2b_test import check  # noqa: E402  (booklet rule checker shared with algorithm 1)

DATA = HERE.parents[1] / "data"
OUT = HERE / "results"


def read(path):
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()  # tolerate stray spaces in a header
    return df


def load_scenario(scenario):
    s = read(DATA / "Test Data/task2b_peak_day_scenarios.csv")
    s = s[s.scenario == scenario].reset_index(drop=True)
    fleet = read(DATA / "Test Data/task2b_peak_day_fleet.csv")
    vehicles = read(DATA / "General Data/vehicles.csv")
    if "weekly_range_km" not in vehicles:
        vehicles["weekly_range_km"] = vehicles.km_per_l * vehicles.weekly_fuel_quota_l
    vehicles = vehicles.merge(fleet[fleet.scenario == scenario], on="vehicle_id")
    travel = read(DATA / "General Data/district_travel.csv").set_index("district")
    service = read(DATA / "General Data/service_allowance.csv").set_index(["brand", "dock_type"])
    return s, vehicles, travel, service


def build(s, vehicles, travel, service):
    orders = [Order(r.order_ref, r.outlet_id, r.brand, r.temp_requirement == "chilled", r.district, r.depot,
                    r.order_weight_kg, r.order_volume_m3, service.loc[(r.brand, r.dock_type), "service_allowance_min"],
                    hhmm_to_min(r.window_open_time), hhmm_to_min(r.window_close_time),
                    r.parking_constraint == "van_only", hist=r.deferred_yesterday * r.days_since_last_served)
              for r in s.itertuples()]
    avail = vehicles[vehicles.status == "available"]
    vehs = [Vehicle(r.vehicle_id, r.type, r.temp, r.depot, r.weight_cap_kg, r.volume_cap_m3, r.km_per_l,
                    r.weekly_range_km) for r in avail.itertuples()]
    return orders, vehs


def convergence_chart(hist, path):
    h = pd.DataFrame(hist, columns=["iter", "current", "best", "destroy", "repair", "outcome"])
    fig, ax = plt.subplots(figsize=(10, 4.5), facecolor="#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    ax.plot(h.iter, h.current, color="#86b6ef", lw=1, label="current")
    ax.plot(h.iter, h.best, color="#1c5cab", lw=2, label="best")
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.grid(axis="y", color="#e1e0d9", lw=0.6)
    ax.set_xlabel("Iteration", color="#52514e")
    ax.set_ylabel("Objective F(S)", color="#52514e")
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")
    ax.legend(frameon=False, labelcolor="#52514e")
    ax.set_title("ALNS convergence on Task 2B scenario S1", loc="left", color="#0b0b0b")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return h


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--scenario", default="S1")
    ap.add_argument("--iterations", type=int, default=DEFAULTS["iterations"])
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--late-penalty", type=float, default=DEFAULTS["late_penalty"])
    a = ap.parse_args()

    s, vehicles, travel, service = load_scenario(a.scenario)
    orders, vehs = build(s, vehicles, travel, service)
    alns = ALNS(orders, vehs, travel.to_dict("index"),
                dict(iterations=a.iterations, seed=a.seed, late_penalty=a.late_penalty))
    t0 = time.time()
    best, hist = alns.run(log=max(a.iterations // 10, 1))
    secs = time.time() - t0

    asg = alns.assignments(best)
    sub = pd.DataFrame([dict(scenario=a.scenario, order_ref=o.id, outlet_id=o.outlet,
                             decision="served" if i in asg else "deferred",
                             vehicle_id=asg[i]["vehicle_id"] if i in asg else "",
                             trip_id=asg[i]["trip_id"] if i in asg else "") for i, o in enumerate(orders)])
    OUT.mkdir(exist_ok=True)
    sub.to_csv(OUT / "task2b_alns_submission.csv", index=False)
    violations, trips = check(sub, s, vehicles, travel, service)
    trips.sort_values(["vehicle_id", "trip_id"]).to_csv(OUT / "task2b_alns_trips.csv", index=False)
    h = convergence_chart(hist, OUT / "task2b_alns_convergence.png")
    h.to_csv(OUT / "task2b_alns_history.csv", index=False)

    # Report
    cat = ["fresh_chilled" if o.chilled else ("fresh_dry" if o.brand == "Fresh" else o.brand.lower()) for o in orders]
    s = s.assign(category=cat, decision=sub.decision.values, h=[o.hist for o in orders],
                 arrival=[min_to_hhmm(asg[i]["arrival_min"]) if i in asg else "" for i in range(len(orders))],
                 late=[asg[i]["late_min"] if i in asg else 0.0 for i in range(len(orders))])
    algo1 = HERE.parent / "algo1" / "results" / "task2b_algo1_submission.csv"
    a1 = pd.read_csv(algo1).set_index("order_ref").decision if algo1.exists() else None
    g = s.groupby("category")
    table = pd.DataFrame({"orders": g.size(), "alns": g.decision.apply(lambda x: (x == "served").sum())})
    if a1 is not None:
        table["algo1"] = s.assign(a1=s.order_ref.map(a1)).groupby("category").a1.apply(lambda x: (x == "served").sum())
    used = [k for k, r in enumerate(best.routes) if r]
    km = sum(alns.trip_km(t) for k in used for t in best.routes[k])
    litres = sum(alns.trip_km(t) / vehs[k].km_per_l for k in used for t in best.routes[k])
    late = s[s.late > 0]

    lines = [f"# ALNS (algorithm 2) on Task 2B scenario {a.scenario}", "",
             f"{a.iterations} iterations, seed {a.seed}, {secs:.0f} s. Objective F(S) = {alns.cost(best):,.1f} "
             f"(initial {hist[0][1]:,.1f}).", "",
             "## Served orders", "",
             "| Category | Orders | Served (ALNS) |" + (" Served (algorithm 1) |" if a1 is not None else ""),
             "|---|---|---|" + ("---|" if a1 is not None else "")]
    for c, r in table.iterrows():
        lines.append(f"| {c} | {r.orders} | {r.alns} |" + (f" {r.algo1} |" if a1 is not None else ""))
    tot = table.sum()
    lines.append(f"| **Total** | {tot.orders} | **{tot.alns}** |" + (f" {tot.algo1} |" if a1 is not None else ""))
    lines += ["", "## Plan", "",
              f"- Vehicles used: {len(used)} of {len(vehs)} available; trips: {len(trips)}",
              f"- Distance: {km:,.0f} km; fuel: {litres:,.0f} litres",
              f"- Late arrivals: {len(late)} orders, {late.late.sum():,.0f} late minutes in total"
              + (f" (worst {late.late.max():.0f} min, {late.sort_values('late').order_ref.iloc[-1]})" if len(late) else ""),
              "", "## Deferred orders", ""]
    d = s[s.decision == "deferred"]
    if d.empty:
        lines.append("None.")
    else:
        lines += ["| order_ref | Outlet | Category | District | Van only | Weight (kg) | Volume (m³) | h |",
                  "|---|---|---|---|---|---|---|---|"]
        lines += [f"| {r.order_ref} | {r.outlet_id} | {r.category} | {r.district} | "
                  f"{'yes' if r.parking_constraint == 'van_only' else ''} | {r.order_weight_kg:,.0f} | "
                  f"{r.order_volume_m3:.2f} | {r.h} |" for r in d.sort_values(["category", "district"]).itertuples()]
    lines += ["", "## Feasibility check (booklet rules 1-7)", ""]
    lines += ["All rules pass."] if not violations else [f"{len(violations)} violations:", ""] + [f"- {x}" for x in violations]
    lines += ["", "## Final operator weights", "",
              "| Operator | Weight |", "|---|---|"]
    lines += [f"| destroy: {op} | {w:.2f} |" for op, w in alns.weights["destroy"].items()]
    lines += [f"| repair: {op} | {w:.2f} |" for op, w in alns.weights["repair"].items()]
    outcomes = h.outcome.value_counts()
    lines += ["", "Iteration outcomes: " + ", ".join(f"{k} {v}" for k, v in outcomes.items()),
              "", "Convergence: `task2b_alns_convergence.png`"]
    report = "\n".join(lines) + "\n"
    (OUT / "task2b_alns_report.md").write_text(report)
    print(report)


if __name__ == "__main__":
    main()
