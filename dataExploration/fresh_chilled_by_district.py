"""Fresh chilled orders by district.

Only Fresh has chilled orders, and 1,625 of the 1,633 deferred orders are Fresh
chilled, so this looks at where that demand and those deferrals sit. It also
charts stops per route for all Fresh routes (dry and chilled) by district.
Orders come from deliveries_train.csv plus task1_test_inputs.csv
(Jan 2024 - Mar 2026). Writes PNGs into byDistrict/.
"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap

HERE = Path(__file__).resolve().parent
# The challenge data lives in the repo root, at Cryptonovate_TBD/data.
DATA = HERE.parent / "data"
OUT = HERE / "byDistrict"

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]  # no orders on Sundays
DEPOT_COLOR = {"Peliyagoda": "#2a78d6", "Kandy": "#eb6834"}  # categorical slots 1-2
DEFERRED, NOT_RUN = "#2a78d6", "#eb6834"
DELIVERED, DEFERRED_H = "#86b6ef", "#1c5cab"  # light / dark blue so deferred stands out on top of delivered
ALL_ROUTES, DRY, CHILLED ="#52514e", "#2a78d6", "#1baf7a"  # chilled = aqua, as in Fleet/ charts
# Sequential blue ramp (steps 100 -> 700) for the heatmap.
BLUES = LinearSegmentedColormap.from_list("blues", ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"])

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
    orders = pd.concat([pd.read_csv(DATA / "Training Data/deliveries_train.csv"),
                        pd.read_csv(DATA / "Test Data/task1_test_inputs.csv")], ignore_index=True)
    chilled = orders[(orders.brand == "Fresh") & (orders.temp_requirement == "chilled")].copy()
    chilled["date"] = pd.to_datetime(chilled.order_date)
    chilled["dow"] = chilled.date.dt.dayofweek
    outlets = pd.read_csv(DATA / "General Data/outlets.csv").set_index("outlet_id")
    vehicles = pd.read_csv(DATA / "General Data/vehicles.csv").set_index("vehicle_id")
    travel = pd.read_csv(DATA / "General Data/district_travel.csv").set_index("district")
    return chilled, outlets, vehicles, travel


def save(fig, name):
    OUT.mkdir(exist_ok=True)
    fig.savefig(OUT / name, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  byDistrict/{name}")


def footnote(fig, text, y=-0.02):
    fig.text(0.07, y, text, fontsize=8.5, color=MUTED, va="top")


def district_summary(chilled, travel):
    days = chilled.date.nunique()
    s = chilled.groupby("district").agg(
        depot=("depot", "first"), outlets=("outlet_id", "nunique"), orders=("delivery_id", "size"),
        volume=("order_volume_m3", "sum"), median_m3=("order_volume_m3", "median"),
        deferred=("dispatch_status", lambda x: (x == "deferred").sum()),
        not_run=("dispatch_status", lambda x: (x == "not_run").sum()))
    s["orders_per_day"] = s.orders / days
    s["m3_per_day"] = s.volume / days
    s["deferred_rate"] = s.deferred / s.orders
    s["not_run_rate"] = s.not_run / s.orders
    s = s.join(travel[["depot_to_district_km", "inter_stop_km", "road_class"]])
    return s


def hbar(ax, s, col, fmt, title, order):
    y = np.arange(len(order))
    vals = s.loc[order, col]
    ax.barh(y, vals, color=[DEPOT_COLOR[d] for d in s.loc[order, "depot"]], height=0.62)
    for yi, v in zip(y, vals):
        ax.text(v, yi, " " + fmt(v), va="center", fontsize=8.5, color=INK_2)
    ax.set_yticks(y, order)
    ax.grid(axis="y", visible=False)
    ax.set_title(title)
    ax.margins(x=0.18)


def demand_chart(s):
    order = s.sort_values("m3_per_day").index.tolist()
    fig, axes = plt.subplots(1, 3, figsize=(16, 5.5), sharey=True)
    hbar(axes[0], s, "orders_per_day", lambda v: f"{v:.1f}", "Chilled orders per day", order)
    hbar(axes[1], s, "m3_per_day", lambda v: f"{v:.1f} m³", "Chilled volume per day", order)
    hbar(axes[2], s, "median_m3", lambda v: f"{v:.2f} m³", "Median chilled order size", order)
    for ax in axes[1:]:
        ax.tick_params(axis="y", length=0)
    handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in DEPOT_COLOR.values()]
    fig.legend(handles, [f"{d} depot" for d in DEPOT_COLOR], frameon=False, loc="upper left",
               bbox_to_anchor=(0.07, 0.97), ncol=2, labelcolor=INK_2)
    fig.suptitle("Fresh chilled demand by district", x=0.07, ha="left", fontsize=14, color=INK, y=1.03)
    footnote(fig, "Averages over every day with orders (Mon–Sat). Sorted by chilled volume per day.")
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    save(fig, "chilled_demand_by_district.png")


def deferral_chart(s):
    order = s.assign(bad=s.deferred_rate + s.not_run_rate).sort_values("bad").index.tolist()
    fig, ax = plt.subplots(figsize=(11, 5.5))
    y = np.arange(len(order))
    d, n = s.loc[order, "deferred_rate"] * 100, s.loc[order, "not_run_rate"] * 100
    ax.barh(y, d, color=DEFERRED, height=0.62, label="deferred")
    ax.barh(y, n, left=d, color=NOT_RUN, height=0.62, label="not run", edgecolor=SURFACE, linewidth=1.5)
    for yi, dist in zip(y, order):
        r = s.loc[dist]
        text = f" {r.deferred_rate:.1%} deferred ({r.deferred:,})"
        if r.not_run:
            text += f" · {r.not_run_rate:.1%} not run ({r.not_run:,})"
        ax.text((r.deferred_rate + r.not_run_rate) * 100, yi, text, va="center", fontsize=8.5, color=INK_2)
    ax.set_yticks(y, [f"{dist} ({s.loc[dist, 'depot']})" for dist in order])
    ax.xaxis.set_major_formatter(lambda v, _: f"{v:g}%")
    ax.set_xlim(0, 45)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("% of the district's chilled orders")
    ax.legend(frameon=False, loc="lower right", labelcolor=INK_2)
    ax.set_title(f"Fresh chilled orders deferred or not run, by district "
                 f"({s.deferred.sum():,} deferred, {s.not_run.sum():,} not run)")
    footnote(fig, "Deferred = dispatch_status 'deferred'; not run = 'not_run'. Both counted on order_date.")
    save(fig, "chilled_deferrals_by_district.png")


def weekday_heatmap(chilled, s):
    deferred = chilled[chilled.dispatch_status == "deferred"]
    order = s.sort_values("deferred", ascending=False).index.tolist()
    counts = (deferred.groupby(["district", "dow"]).size().unstack(fill_value=0)
              .reindex(index=order, columns=range(6), fill_value=0))
    totals = chilled.groupby(["district", "dow"]).size().unstack(fill_value=0).reindex(index=order, columns=range(6))
    rate = counts / totals  # NaN where a district has no chilled orders on that weekday

    fig, ax = plt.subplots(figsize=(10, 6.5))
    vmax = np.nanmax(rate.values)
    shown = np.ma.masked_invalid(rate.values)
    cmap = BLUES.copy()
    cmap.set_bad(SURFACE)
    ax.imshow(shown, cmap=cmap, aspect="auto", vmin=0, vmax=vmax)
    for i in range(len(order)):
        for j in range(6):
            n, r = counts.iat[i, j], rate.iat[i, j]
            if r != r:
                text, dark = "no orders", False
            else:
                text, dark = (f"{n:,}\n{r:.1%}" if n else "0"), r > vmax * 0.45
            ax.text(j, i, text, ha="center", va="center", fontsize=8.5,
                    color=SURFACE if dark else INK_2, linespacing=1.2)
    ax.set_xticks(range(6), DAYS)
    ax.set_yticks(range(len(order)), order)
    ax.tick_params(length=0)
    ax.grid(False)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_title("Deferred Fresh chilled orders by district and weekday")
    footnote(fig, "Each cell: deferred orders, and the share of that district's chilled orders on that weekday "
                  "that were deferred.\nDarker = higher share. Counted on order_date.", y=0.02)
    save(fig, "chilled_deferrals_district_weekday.png")


def route_utilisation(chilled, vehicles, s):
    """How full chilled routes leave the depot, per district."""
    ran = chilled[chilled.dispatch_status == "attempted"]
    routes = ran.groupby("route_id").agg(district=("district", "first"), m3=("order_volume_m3", "sum"),
                                         stops=("delivery_id", "size"), vehicle_id=("vehicle_id", "first"))
    routes["util"] = routes.m3 / routes.vehicle_id.map(vehicles.volume_cap_m3)
    routes["van"] = routes.vehicle_id.map(vehicles.type) == "van"
    order = routes.groupby("district").util.median().sort_values().index.tolist()

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 5.5), sharey=True,
                                   gridspec_kw=dict(width_ratios=[2, 1]))
    data = [routes.loc[routes.district == d, "util"].values * 100 for d in order]
    ax1.boxplot(data, orientation="horizontal", widths=0.6, showfliers=False, patch_artist=True,
                boxprops=dict(facecolor=DEFERRED, edgecolor=DEFERRED),
                medianprops=dict(color=SURFACE, linewidth=1.5),
                whiskerprops=dict(color=MUTED), capprops=dict(color=MUTED))
    ax1.set_yticks(range(1, len(order) + 1), order)
    ax1.set_xlim(0, 100)
    ax1.xaxis.set_major_formatter(lambda v, _: f"{v:g}%")
    ax1.set_xlabel("Route volume ÷ vehicle volume capacity")
    ax1.grid(axis="y", visible=False)
    ax1.set_title("How full chilled routes are")

    stops = routes.groupby("district").stops.mean().reindex(order)
    vans = routes.groupby("district").van.mean().reindex(order)
    y = np.arange(1, len(order) + 1)
    ax2.barh(y, stops, color=DEFERRED, height=0.62)
    for yi, st, v in zip(y, stops, vans):
        ax2.text(st, yi, f" {st:.1f}" + (f"  ({v:.0%} by van)" if v >= 0.005 else ""), va="center", fontsize=8.5,
                 color=INK_2)
    ax2.grid(axis="y", visible=False)
    ax2.margins(x=0.45)
    ax2.set_xlabel("Stops per route (average)")
    ax2.set_title("Stops per chilled route")
    ax2.tick_params(axis="y", length=0)
    fig.suptitle(f"Fresh chilled routes by district ({len(routes):,} routes)", x=0.07, ha="left",
                 fontsize=14, color=INK, y=1.02)
    footnote(fig, "Routes built from attempted chilled orders. Box = middle 50% of routes, white line = median, "
                  "whiskers = 1.5 × IQR; outliers hidden.")
    save(fig, "chilled_route_utilisation_by_district.png")
    return routes


def outlet_chart(chilled, outlets):
    """Deferral and not-run rate per outlet in the two districts where deferrals happen."""
    focus = ["Colombo", "Gampaha"]
    c = chilled[chilled.district.isin(focus)]
    g = c.groupby("outlet_id").agg(district=("district", "first"), orders=("delivery_id", "size"),
                                   deferred=("dispatch_status", lambda x: (x == "deferred").mean()),
                                   not_run=("dispatch_status", lambda x: (x == "not_run").mean()))
    g = g.join(outlets[["parking_constraint", "dock_type", "window_open_time", "window_close_time"]])
    fig, axes = plt.subplots(2, 1, figsize=(11, 10), sharex=True,
                             gridspec_kw=dict(height_ratios=[g.district.eq(d).sum() for d in focus]))
    for ax, dist in zip(axes, focus):
        sub = g[g.district == dist].sort_index(ascending=False)
        y = np.arange(len(sub))
        ax.barh(y, sub.deferred * 100, color=DEFERRED, height=0.65, label="deferred")
        ax.barh(y, sub.not_run * 100, left=sub.deferred * 100, color=NOT_RUN, height=0.65,
                edgecolor=SURFACE, linewidth=1.5, label="not run")
        for yi, r in zip(y, sub.itertuples()):
            ax.text((r.deferred + r.not_run) * 100, yi,
                    f" {r.deferred:.0%} deferred" + (f" + {r.not_run:.0%} not run" if r.not_run >= 0.005 else ""),
                    va="center", fontsize=8.5, color=INK_2)
        ax.set_yticks(y, [f"{i} · {'VAN ONLY' if p == 'van_only' else d.replace('_', ' ')} · {o}–{cl}"
                          for i, p, d, o, cl in zip(sub.index, sub.parking_constraint, sub.dock_type,
                                                    sub.window_open_time, sub.window_close_time)], fontsize=8.5)
        ax.grid(axis="y", visible=False)
        ax.set_xlim(0, 65)
        ax.xaxis.set_major_formatter(lambda v, _: f"{v:g}%")
        ax.set_title(f"{dist} ({len(sub)} outlets)")
    axes[1].set_xlabel("% of the outlet's chilled orders")
    axes[0].legend(frameon=False, loc="lower right", labelcolor=INK_2)
    fig.suptitle("Colombo and Gampaha: chilled orders deferred or not run, by outlet", x=0.07, ha="left",
                 fontsize=14, color=INK, y=1.0)
    footnote(fig, "Each label: outlet · parking constraint or dock type · delivery window. Van-only outlets are "
                  "served by vans.", y=0.0)
    fig.tight_layout(rect=(0, 0.02, 1, 0.97))
    save(fig, "colombo_gampaha_outlets.png")
    return g


def hist_by_weekday(chilled, district, column, unit, label):
    """Chilled order size histograms for one district, one panel per weekday, split by what happened."""
    f = chilled[chilled.district == district]
    hi = np.percentile(f[column], 99.5)
    bins = np.linspace(0, hi, 36)
    overall = f[column].median()
    status = [("attempted", "delivered", DELIVERED), ("deferred", "deferred", DEFERRED_H),
              ("not_run", "not run", NOT_RUN)]
    dec = 0 if unit == "kg" else 2
    fig, axes = plt.subplots(2, 3, figsize=(15, 7.5), sharex=True, sharey=True)
    rows = []
    for d, ax in enumerate(axes.flat):
        day = f[f.dow == d]
        stacks = [day.loc[day.dispatch_status == s, column].clip(upper=hi) for s, _, _ in status]
        ax.hist(stacks, bins=bins, stacked=True, color=[c for *_, c in status], label=[n for _, n, _ in status],
                edgecolor=SURFACE, linewidth=0.5)
        ax.axvline(overall, color=MUTED, lw=1, ls="--")
        med = day[column].median()
        ax.axvline(med, color=INK, lw=1)
        ax.annotate(f"median {med:,.{dec}f} {unit}", (med, 1), xycoords=("data", "axes fraction"),
                    xytext=(4, -2), textcoords="offset points", fontsize=8.5, color=INK, va="top")
        share = (day.dispatch_status != "attempted").mean()
        ax.set_title(f"{DAYS[d]} ({len(day):,} orders, {share:.0%} deferred or not run)", fontsize=11)
        ax.grid(axis="x", visible=False)
        rows.append(dict(day=DAYS[d], orders=len(day), median=round(med, dec + 1),
                         median_delivered=round(day.loc[day.dispatch_status == "attempted", column].median(), dec + 1),
                         median_deferred=round(day.loc[day.dispatch_status == "deferred", column].median(), dec + 1),
                         deferred_or_not_run=f"{share:.0%}"))
    for ax in axes[1]:
        ax.set_xlabel(f"{label.capitalize()} per order ({unit})")
    for ax in axes[:, 0]:
        ax.set_ylabel("Orders")
    axes[0, 2].legend(frameon=False, loc="center right", labelcolor=INK_2, fontsize=9)
    fig.suptitle(f"{district}: Fresh chilled order {label} by day of week ({len(f):,} orders)", x=0.07, ha="left",
                 fontsize=14, color=INK, y=1.0)
    fig.text(0.07, -0.01, f"Day of week of order_date; no orders on Sundays. Solid line = that day's median, dashed = "
                          f"{district}'s median over all days ({overall:,.{dec}f} {unit}).\nBars are stacked by "
                          f"dispatch_status. Values above the 99.5th percentile ({hi:,.2f} {unit}) are shown in the "
                          "last bin.", fontsize=8.5, color=MUTED, va="top")
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    save(fig, f"{district.lower()}_chilled_{label}_by_weekday_hist.png")
    return pd.DataFrame(rows)


def stops_per_route():
    """Average stops per Fresh route by district: all routes, dry (ambient) routes and chilled routes."""
    orders = pd.concat([pd.read_csv(DATA / "Training Data/deliveries_train.csv"),
                        pd.read_csv(DATA / "Test Data/task1_test_inputs.csv")], ignore_index=True)
    ran = orders[(orders.brand == "Fresh") & (orders.dispatch_status == "attempted")]
    # Every route stays in one district and carries one temperature, so first() is safe.
    routes = ran.groupby("route_id").agg(district=("district", "first"), temp=("temp_requirement", "first"),
                                         stops=("outlet_id", "nunique"))
    table = routes.groupby(["district", "temp"]).stops.mean().unstack()
    table["all"] = routes.groupby("district").stops.mean()
    table["routes"] = routes.groupby("district").size()
    table["outlets"] = ran.groupby("district").outlet_id.nunique()
    table = table.sort_values("all")

    series = [("all", "all Fresh routes", ALL_ROUTES), ("ambient", "dry (ambient) routes", DRY),
              ("chilled", "chilled routes", CHILLED)]
    fig, ax = plt.subplots(figsize=(11, 8))
    y = np.arange(len(table))
    h = 0.26
    for k, (col, label, color) in enumerate(series):
        pos = y + (1 - k) * h
        ax.barh(pos, table[col], height=h, color=color, label=label)
        for p, v in zip(pos, table[col]):
            ax.text(v, p, f" {v:.1f}", va="center", fontsize=8, color=INK_2)
    ax.set_yticks(y, [f"{d} ({int(r.outlets)} outlets)" for d, r in table.iterrows()])
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Stops per route (average)")
    ax.margins(x=0.08)
    ax.legend(frameon=False, loc="lower right", labelcolor=INK_2)
    ax.set_title(f"Fresh stops per route by district ({len(routes):,} routes)")
    footnote(fig, "Stops = distinct outlets on a route; routes that ran only (dispatch_status 'attempted'). "
                  "Every route stays in one district and carries one temperature.\nOutlet count = Fresh outlets "
                  "in the district. Sorted by the all-routes average.", y=0.02)
    save(fig, "fresh_stops_per_route_by_district.png")
    return table


def main():
    print("Fresh stops per route:")
    print(stops_per_route().round(2).to_string())
    chilled, outlets, vehicles, travel = load()
    print(f"{len(chilled):,} Fresh chilled orders. Writing:")
    s = district_summary(chilled, travel)
    demand_chart(s)
    deferral_chart(s)
    weekday_heatmap(chilled, s)
    routes = route_utilisation(chilled, vehicles, s)
    g = outlet_chart(chilled, outlets)
    for district in ["Colombo", "Gampaha"]:
        print(f"\n{district} chilled volume by weekday (m³):")
        print(hist_by_weekday(chilled, district, "order_volume_m3", "m³", "volume").to_string(index=False))
        print(f"{district} chilled weight by weekday (kg):")
        print(hist_by_weekday(chilled, district, "order_weight_kg", "kg", "weight").to_string(index=False))

    cols = ["depot", "outlets", "orders", "orders_per_day", "m3_per_day", "median_m3",
            "deferred", "deferred_rate", "not_run", "not_run_rate", "depot_to_district_km", "road_class"]
    print("\n" + s[cols].sort_values("deferred_rate", ascending=False).round(3).to_string())
    print("\nChilled route utilisation (median):")
    print(routes.groupby("district").util.median().sort_values().round(2).to_string())
    print("\nColombo and Gampaha outlets:")
    print(g.sort_values(["district", "deferred"]).round(3).to_string())


if __name__ == "__main__":
    main()
