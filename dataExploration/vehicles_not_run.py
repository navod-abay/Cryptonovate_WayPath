"""How many vehicles sit idle, run once or run twice each day, by weekday.

For every operating day each vehicle is put in one bucket by how many routes it
ran that day: 0 (not used), 1 (used once) or 2 (used twice; no vehicle runs
more than two). The charts show the average count per weekday.

Scopes: the whole company, Peliyagoda depot, and Peliyagoda chilled routes only
(a vehicle that ran only dry routes that day counts as not used). Each scope is
drawn for all vehicles and again for reefer vehicles only, giving six figures.

Routes come from the attempted orders in deliveries_train.csv plus
task1_test_inputs.csv (Jan 2024 - Mar 2026). Writes PNGs into vehiclesNotRun/.
"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
# The challenge data lives in the repo root, at Cryptonovate_TBD/data.
DATA = HERE.parent / "data"
OUT = HERE / "vehiclesNotRun"

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]  # no routes on Sundays
BUCKETS = [("not used", 0, "#eb6834"), ("used once", 1, "#2a78d6"), ("used twice", 2, "#1baf7a")]

SURFACE, INK, INK_2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": AXIS, "axes.labelcolor": INK_2, "axes.titlecolor": INK,
    "axes.titlesize": 12, "axes.titlelocation": "left", "axes.titlepad": 10,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.axisbelow": True,
    "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelcolor": INK_2, "ytick.labelcolor": INK_2,
    "font.size": 10,
})


def load():
    vehicles = pd.read_csv(DATA / "General Data/vehicles.csv")
    orders = pd.concat([pd.read_csv(DATA / "Training Data/deliveries_train.csv"),
                        pd.read_csv(DATA / "Test Data/task1_test_inputs.csv")], ignore_index=True)
    ran = orders[orders.dispatch_status == "attempted"]
    return vehicles, ran


def routes_per_vehicle_day(ran, fleet, depot=None, chilled_only=False):
    """Days x vehicles table of how many routes each vehicle ran that day (0 if none)."""
    days = pd.Index(sorted(ran.dispatch_date.unique()), name="date")  # every operating day
    o = ran
    if depot:
        o = o[o.depot == depot]
    if chilled_only:
        o = o[o.temp_requirement == "chilled"]
    counts = (o[o.vehicle_id.isin(fleet.vehicle_id)].groupby(["dispatch_date", "vehicle_id"]).route_id.nunique()
              .unstack(fill_value=0).reindex(index=days, columns=fleet.vehicle_id, fill_value=0))
    return counts


def weekday_buckets(counts):
    """Per day: vehicles not used / used once / used twice; then the average for each weekday."""
    per_day = pd.DataFrame({name: (counts == n).sum(axis=1) if n < 2 else (counts >= 2).sum(axis=1)
                            for name, n, _ in BUCKETS})
    per_day["dow"] = pd.to_datetime(per_day.index).dayofweek
    return per_day.groupby("dow")[[b for b, _, _ in BUCKETS]].mean().reindex(range(6)), per_day


def figure(counts, fleet, title, subtitle, name):
    avg, per_day = weekday_buckets(counts)
    n = len(fleet)
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.8), sharey=True)
    x = np.arange(6)
    for ax, (bucket, _, color) in zip(axes, BUCKETS):
        vals = avg[bucket].values
        bars = ax.bar(x, vals, color=color, width=0.62)
        ax.bar_label(bars, labels=[f"{v:.1f}" for v in vals], padding=3, fontsize=9, color=INK_2)
        ax.axhline(n, color=INK_2, lw=1, ls="--")
        ax.set_xticks(x, DAYS)
        ax.grid(axis="x", visible=False)
        ax.set_title(f"Vehicles {bucket} (average {per_day[bucket].mean():.1f} a day)")
    axes[0].set_ylabel("Vehicles per day (average)")
    axes[0].set_ylim(0, n * 1.12)
    axes[2].annotate(f"fleet: {n} vehicles", (5.4, n), xytext=(0, 4), textcoords="offset points",
                     ha="right", va="bottom", fontsize=8.5, color=INK_2)
    fig.suptitle(title, x=0.07, ha="left", fontsize=14, color=INK, y=1.03)
    fig.text(0.07, -0.02, subtitle + f" Averages over {len(per_day)} operating days; the three bars for a day "
                                     "add up to the fleet size.", fontsize=8.5, color=MUTED, va="top")
    OUT.mkdir(exist_ok=True)
    fig.savefig(OUT / name, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  vehiclesNotRun/{name}")
    return avg.round(2).set_axis(DAYS)


def main():
    vehicles, ran = load()
    reefers = vehicles[vehicles.temp == "reefer"]
    plio = vehicles[vehicles.depot == "Peliyagoda"]
    plio_reefers = reefers[reefers.depot == "Peliyagoda"]
    print(f"{len(ran):,} attempted orders, {ran.route_id.nunique():,} routes. Writing:")

    scopes = [
        # (fleet, depot, chilled_only, title, subtitle, file)
        (vehicles, None, False, "Vehicle use by day of week: whole company (all vehicles)",
         "All 60 vehicles, all routes.", "all_vehicles_company.png"),
        (plio, "Peliyagoda", False, "Vehicle use by day of week: Peliyagoda depot (all vehicles)",
         "Peliyagoda's 38 vehicles, Peliyagoda routes.", "all_vehicles_peliyagoda.png"),
        (plio, "Peliyagoda", True, "Vehicle use by day of week: Peliyagoda chilled routes (all vehicles)",
         "Peliyagoda's 38 vehicles, counting only chilled routes (a vehicle that ran only dry routes counts as "
         "not used).", "all_vehicles_peliyagoda_chilled.png"),
        (reefers, None, False, "Reefer use by day of week: whole company",
         f"All {len(reefers)} reefer vehicles, all routes.", "reefer_company.png"),
        (plio_reefers, "Peliyagoda", False, "Reefer use by day of week: Peliyagoda depot",
         f"Peliyagoda's {len(plio_reefers)} reefer vehicles, Peliyagoda routes.", "reefer_peliyagoda.png"),
        (plio_reefers, "Peliyagoda", True, "Reefer use by day of week: Peliyagoda chilled routes",
         f"Peliyagoda's {len(plio_reefers)} reefer vehicles, counting only chilled routes (a reefer that ran only "
         "dry routes counts as not used).", "reefer_peliyagoda_chilled.png"),
    ]
    for fleet, depot, chilled_only, title, subtitle, name in scopes:
        counts = routes_per_vehicle_day(ran, fleet, depot, chilled_only)
        table = figure(counts, fleet, title, subtitle, name)
        print(f"\n{title}\n{table.to_string()}\n")


if __name__ == "__main__":
    main()
