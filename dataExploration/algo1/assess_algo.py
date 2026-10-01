"""Assess a routing algorithm from its decisions CSV (the format written by algo1.py).

Expected columns: plan_date, delivery_id, outlet_id, category, district, decision ("served" / "deferred").
There is one row per order per planning day, so an order deferred twice and then served has three rows.

Key metrics
  1. Deferrals: deferral events (order-days deferred), orders ever deferred, orders never served.
  2. Continuous deferrals: for each order, the longest run of consecutive planning days it was deferred.
  3. Spread across outlets: deferral events per outlet, how many outlets are affected, how concentrated
     they are (Gini coefficient, share taken by the worst 5 outlets).
If a routes CSV is given (algo1.py's <prefix>_routes.csv), trip counts, fill and km are reported too.

--historical adds the same metrics for what actually happened in the data (dispatch_date vs order_date),
as a baseline. Writes a markdown report next to the decisions CSV.

Usage: python assess_algo.py results/algo1_decisions.csv [--routes results/algo1_routes.csv] [--historical]
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
# The challenge data lives in the repo root, at Cryptonovate_TBD/data.
DATA = HERE.parents[1] / "data"
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def gini(x):
    x = np.sort(np.asarray(x, dtype=float))
    if x.sum() == 0:
        return 0.0
    n = len(x)
    return float((2 * np.arange(1, n + 1) - n - 1).dot(x) / (n * x.sum()))


def longest_runs(dec):
    """Longest run of consecutive planning days each order was deferred (0 if never deferred)."""
    days = {d: i for i, d in enumerate(sorted(dec.plan_date.unique()))}
    d = dec[dec.decision == "deferred"][["delivery_id", "plan_date"]].copy()
    if d.empty:
        return pd.Series(0, index=dec.delivery_id.unique())
    d["i"] = d.plan_date.map(days)
    d = d.sort_values(["delivery_id", "i"])
    d["run"] = (d.i.diff() != 1) | (d.delivery_id != d.delivery_id.shift())
    d["run_id"] = d.run.cumsum()
    runs = d.groupby(["delivery_id", "run_id"]).size().groupby("delivery_id").max()
    return runs.reindex(dec.delivery_id.unique(), fill_value=0)


def metrics(dec, all_outlets):
    orders = dec.groupby("delivery_id").agg(outlet_id=("outlet_id", "first"), category=("category", "first"),
                                             district=("district", "first"),
                                             deferrals=("decision", lambda s: (s == "deferred").sum()),
                                             served=("decision", lambda s: (s == "served").any()))
    orders["longest_run"] = longest_runs(dec)
    events = dec[dec.decision == "deferred"]
    per_outlet = events.groupby("outlet_id").size().reindex(all_outlets, fill_value=0)

    m = {
        "orders": len(orders),
        "deferral events (order-days)": len(events),
        "orders ever deferred": int((orders.deferrals > 0).sum()),
        "share of orders deferred": (orders.deferrals > 0).mean(),
        "orders never served": int((~orders.served).sum()),
        "longest continuous deferral (days)": int(orders.longest_run.max()),
        "mean run for deferred orders (days)": orders.loc[orders.deferrals > 0, "longest_run"].mean()
        if (orders.deferrals > 0).any() else 0.0,
        "orders deferred 2+ days in a row": int((orders.longest_run >= 2).sum()),
        "orders deferred 3+ days in a row": int((orders.longest_run >= 3).sum()),
        "outlets with any deferral": f"{int((per_outlet > 0).sum())} of {len(all_outlets)}",
        "deferrals at the worst outlet": int(per_outlet.max()),
        "share of deferrals at the worst 5 outlets": per_outlet.nlargest(5).sum() / per_outlet.sum()
        if per_outlet.sum() else 0.0,
        "Gini of deferrals across outlets (0 = even, 1 = one outlet)": gini(per_outlet),
    }
    run_dist = orders.loc[orders.deferrals > 0, "longest_run"].clip(upper=5).value_counts().sort_index()
    run_dist.index = [f"{i}+" if i == 5 else str(i) for i in run_dist.index]
    tables = {
        "Deferral events by category": events.groupby("category").size(),
        "Deferral events by district": events.groupby("district").size().sort_values(ascending=False),
        "Deferral events by weekday": events.groupby(pd.to_datetime(events.plan_date).dt.dayofweek).size()
                                            .rename(index=dict(enumerate(DAYS))),
        "Deferred orders by longest continuous run (days)": run_dist,
        "Worst 10 outlets (deferral events)": per_outlet[per_outlet > 0].nlargest(10),
    }
    return m, tables


def route_metrics(rts):
    per_day = rts.groupby("plan_date")
    m = {
        "vehicle-trips per day": len(rts) / rts.plan_date.nunique(),
        "vehicles used per day": per_day.vehicle_id.nunique().mean(),
        "vehicles running 2 trips per day": (rts.groupby(["plan_date", "vehicle_id"]).size() == 2)
                                            .groupby("plan_date").sum().mean(),
        "stops per trip": rts.stops.mean(),
        "km per day": per_day.km.sum().mean(),
    }
    fill = rts.groupby("category")[["weight_util", "volume_util"]].median()
    return m, {"Median fill by category (share of capacity)": fill}


def historical_decisions():
    """What actually happened, in the same format: one deferred row per operating day an order waited."""
    h = pd.concat([pd.read_csv(DATA / "Training Data/deliveries_train.csv"),
                   pd.read_csv(DATA / "Test Data/task1_test_inputs.csv")], ignore_index=True)
    h["category"] = h.brand.str.lower().where(h.brand != "Fresh",
                                              "fresh_" + h.temp_requirement.map({"chilled": "chilled",
                                                                                 "ambient": "dry"}))
    days = sorted(h.order_date.unique())
    idx = {d: i for i, d in enumerate(days)}
    rows = []
    for r in h.itertuples():
        start = idx[r.order_date]
        if r.dispatch_status == "attempted":
            end = idx.get(r.dispatch_date, start)
        elif r.dispatch_status == "deferred":
            end = idx.get(r.dispatch_date, len(days))  # waits until dispatch_date
        else:  # not_run: never delivered; count one deferral on its order day
            end = start + 1
        base = dict(delivery_id=r.delivery_id, outlet_id=r.outlet_id, category=r.category, district=r.district)
        for i in range(start, min(end, len(days))):
            rows.append(dict(base, plan_date=days[i], decision="deferred"))
        if r.dispatch_status != "not_run" and end < len(days):
            rows.append(dict(base, plan_date=days[end], decision="served"))
    return pd.DataFrame(rows)


def fmt(key, v):
    if key.startswith("share"):
        return f"{v:.1%}"
    if isinstance(v, float):
        return f"{v:,.2f}"
    if isinstance(v, (int, np.integer)):
        return f"{v:,}"
    return str(v)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("decisions")
    ap.add_argument("--routes", help="routes CSV for trip, fill and km metrics")
    ap.add_argument("--historical", action="store_true", help="compare with what happened in the data")
    a = ap.parse_args()

    dec = pd.read_csv(a.decisions)
    all_outlets = pd.read_csv(DATA / "General Data/outlets.csv").outlet_id
    runs = {"algorithm": metrics(dec, all_outlets)}
    if a.historical:
        runs["historical"] = metrics(historical_decisions(), all_outlets)

    lines = [f"# Assessment of `{Path(a.decisions).name}`", ""]
    names = list(runs)
    lines += ["| Metric | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
    for key in runs["algorithm"][0]:
        lines.append(f"| {key} | " + " | ".join(fmt(key, runs[n][0][key]) for n in names) + " |")
    if a.historical:
        lines += ["", "Historical = what happened in the data (dispatch_date vs order_date; `not_run` orders "
                      "count as one deferral and never served). It is not a like-for-like baseline if the "
                      "algorithm leaves out constraints the real operation had (time windows, travel times, "
                      "vehicle downtime)."]
    for title in runs["algorithm"][1]:
        lines += ["", f"## {title}", ""]
        merged = pd.concat({n: runs[n][1][title] for n in names}, axis=1).fillna(0)
        if merged.empty:
            lines.append("None.")
            continue
        lines += ["| | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
        for idx, row in merged.iterrows():
            lines.append(f"| {idx} | " + " | ".join(f"{int(x):,}" for x in row) + " |")
    if a.routes:
        m, tables = route_metrics(pd.read_csv(a.routes))
        lines += ["", "## Routes (algorithm)", "", "| Metric | Value |", "|---|---|"]
        lines += [f"| {k} | {v:,.2f} |" for k, v in m.items()]
        for title, t in tables.items():
            lines += ["", f"### {title}", "", "| Category | Weight | Volume |", "|---|---|---|"]
            lines += [f"| {c} | {r.weight_util:.0%} | {r.volume_util:.0%} |" for c, r in t.iterrows()]

    report = "\n".join(lines) + "\n"
    out = Path(a.decisions).with_name(Path(a.decisions).stem.replace("_decisions", "") + "_assessment.md")
    out.write_text(report)
    print(report)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
