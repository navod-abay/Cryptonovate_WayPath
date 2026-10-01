"""Distribution charts for orders and outlets.

Writes PNGs into brand folders (Fresh/, Style/, Tech/) and All/ for the
charts that cover every brand. Orders come from deliveries_train.csv plus
task1_test_inputs.csv (same columns, together Jan 2024 - Mar 2026).
"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
# The challenge data lives in the repo root, at Cryptonovate_TBD/data.
DATA = HERE.parent / "data"

BRANDS = ["Fresh", "Style", "Tech"]
# Brand colours are categorical slots 1-3; "All" is neutral ink.
COLOR = {"Fresh": "#2a78d6", "Style": "#eb6834", "Tech": "#1baf7a", "All": "#52514e"}
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

SURFACE, INK, INK_2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": AXIS, "axes.labelcolor": INK_2, "axes.titlecolor": INK,
    "axes.titlesize": 13, "axes.titlelocation": "left", "axes.titlepad": 12,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.axisbelow": True,
    "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelcolor": INK_2, "ytick.labelcolor": INK_2,
    "font.size": 10,
})


def load():
    orders = pd.concat([pd.read_csv(DATA / "Training Data/deliveries_train.csv"),
                        pd.read_csv(DATA / "Test Data/task1_test_inputs.csv")], ignore_index=True)
    orders["dow"] = pd.to_datetime(orders.order_date).dt.dayofweek
    outlets = pd.read_csv(DATA / "General Data/outlets.csv")
    return orders, outlets


def save(fig, folder, name):
    out = HERE / folder
    out.mkdir(exist_ok=True)
    fig.savefig(out / name, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  {folder}/{name}")


def note(ax, text):
    ax.text(0, -0.16, text, transform=ax.transAxes, fontsize=8.5, color=MUTED, va="top")


def histogram(values, who, column, unit, label, kind=None):
    """One histogram with median and 95th percentile marked. kind = "chilled" / "dry" for Fresh sub-groups."""
    fig, ax = plt.subplots(figsize=(9, 4.8))
    hi = np.percentile(values, 99.5)  # clip the long tail so the body is readable
    bins = np.linspace(0, hi, 50)
    ax.hist(values.clip(upper=hi), bins=bins, color=COLOR[who], edgecolor=SURFACE, linewidth=0.8)
    ax.grid(axis="x", visible=False)
    for q, style in [(50, "-"), (95, "--")]:
        v = np.percentile(values, q)
        ax.axvline(v, color=INK, lw=1, ls=style)
        ax.annotate(f"{'median' if q == 50 else 'p95'} {v:,.{0 if unit == 'kg' else 2}f} {unit}",
                    (v, 1), xycoords=("data", "axes fraction"), xytext=(4, -2), textcoords="offset points",
                    fontsize=9, color=INK, va="top")
    who_txt = "all brands" if who == "All" else who
    if kind:
        who_txt += " chilled" if kind == "chilled" else " dry (ambient)"
    ax.set_title(f"Order {label} distribution: {who_txt} ({len(values):,} orders)")
    ax.set_xlabel(f"{label.capitalize()} per order ({unit})")
    ax.set_ylabel("Orders")
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")
    note(ax, f"Range {values.min():,.2f}–{values.max():,.2f} {unit}. Values above the 99.5th percentile "
             f"({hi:,.2f} {unit}) are shown in the last bin.")
    save(fig, who, f"{kind + '_' if kind else ''}{column}_distribution.png")


def weekday_bars(orders, who):
    counts = orders.groupby("dow").size().reindex(range(7), fill_value=0)
    fig, ax = plt.subplots(figsize=(8, 4.5))
    bars = ax.bar(DAYS, counts.values, color=COLOR[who], width=0.62)
    ax.grid(axis="x", visible=False)
    ax.bar_label(bars, labels=[f"{v:,}" for v in counts.values], padding=3, fontsize=9, color=INK_2)
    who_txt = "all brands" if who == "All" else who
    ax.set_title(f"Orders by day of week: {who_txt} ({len(orders):,} orders)")
    ax.set_ylabel("Orders")
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")
    ax.margins(y=0.12)
    note(ax, "Day of week of order_date. No orders are placed on Sundays.")
    save(fig, who, "orders_by_weekday.png")


def to_hours(hhmm):
    h, m = map(int, hhmm.split(":"))
    return h + m / 60


def mall_windows(outlets):
    mall = outlets[outlets.mall_window.notna()].copy()
    mall["start"], mall["end"] = mall.window_open_time.map(to_hours), mall.window_close_time.map(to_hours)
    mall = mall.sort_values(["start", "brand", "outlet_id"], ascending=[False, True, False])
    fig, ax = plt.subplots(figsize=(9, 5.2))
    y = np.arange(len(mall))
    ax.barh(y, mall.end - mall.start, left=mall.start, color=[COLOR[b] for b in mall.brand], height=0.62)
    ax.set_yticks(y, [f"{r.outlet_id} · {r.district}" for r in mall.itertuples()])
    ax.set_xlim(8, 13.5)
    ax.set_xticks(range(8, 14), [f"{h:02d}:00" for h in range(8, 14)])
    ax.grid(axis="y", visible=False)
    for yi, r in zip(y, mall.itertuples()):
        ax.text(r.end + 0.08, yi, r.mall_window, va="center", fontsize=8.5, color=INK_2)
    handles = [plt.Rectangle((0, 0), 1, 1, color=COLOR[b]) for b in ["Style", "Tech"]]
    ax.legend(handles, ["Style (9)", "Tech (3)"], frameon=False, loc="upper right", labelcolor=INK_2)
    counts = mall.mall_window.value_counts().sort_index()
    ax.set_title("Mall loading windows (12 mall outlets)")
    note(ax, "Windows: " + ", ".join(f"{w} × {n}" for w, n in counts.items())
         + ". Every window is 2 hours. Fresh has no mall outlets.")
    save(fig, "All", "mall_loading_windows.png")


def all_windows(outlets):
    """Every outlet has a delivery window; group the distinct ones."""
    g = (outlets.assign(kind=np.where(outlets.mall_window.notna(), "mall", "non-mall"))
         .groupby(["brand", "kind", "window_open_time", "window_close_time"]).size().reset_index(name="n"))
    g["start"], g["end"] = g.window_open_time.map(to_hours), g.window_close_time.map(to_hours)
    g = g.sort_values(["brand", "kind", "start", "end"], ascending=[False, False, False, False])
    fig, ax = plt.subplots(figsize=(10, 6))
    y = np.arange(len(g))
    ax.barh(y, g.end - g.start, left=g.start, color=[COLOR[b] for b in g.brand], height=0.62)
    ax.set_yticks(y, [f"{r.brand} · {r.kind}" for r in g.itertuples()])
    ax.set_xlim(2, 19.5)
    ax.set_xticks(range(2, 20, 2), [f"{h:02d}:00" for h in range(2, 20, 2)])
    ax.grid(axis="y", visible=False)
    for yi, r in zip(y, g.itertuples()):
        ax.text(r.end + 0.15, yi, f"{r.window_open_time}–{r.window_close_time}  ({r.n} outlet{'s' * (r.n > 1)})",
                va="center", fontsize=8.5, color=INK_2)
    ax.set_title("Delivery windows for all 120 outlets")
    note(ax, "Each bar is one distinct window. Fresh delivers early morning, Style and Tech non-mall outlets "
             "09:00–17:00,\nmall outlets inside a 2-hour mall window.")
    save(fig, "All", "all_outlet_windows.png")


def chilled_by_outlet(orders, outlets, column, unit, label):
    f = orders[(orders.brand == "Fresh") & (orders.temp_requirement == "chilled")]
    district = outlets.set_index("outlet_id").district
    order = f.groupby("outlet_id")[column].median().sort_values().index
    data = [f.loc[f.outlet_id == o, column].values for o in order]
    fig, ax = plt.subplots(figsize=(9, 17))
    ax.boxplot(data, orientation="horizontal", widths=0.6, showfliers=False, patch_artist=True,
               boxprops=dict(facecolor=COLOR["Fresh"], edgecolor=COLOR["Fresh"]),
               medianprops=dict(color=SURFACE, linewidth=1.5),
               whiskerprops=dict(color=MUTED), capprops=dict(color=MUTED))
    ax.set_yticks(range(1, len(order) + 1), [f"{o} · {district[o]}" for o in order], fontsize=7.5)
    ax.set_ylim(0.3, len(order) + 0.7)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel(f"Chilled order {label} ({unit})")
    ax.set_title(f"Fresh chilled order {label} by outlet ({len(order)} outlets, {len(f):,} orders)")
    ax.text(0, -0.035, "Sorted by median (white line). Box = middle 50% of orders, whiskers = 1.5 × IQR; "
                       "outliers hidden.", transform=ax.transAxes, fontsize=8.5, color=MUTED, va="top")
    save(fig, "Fresh", f"chilled_{label}_by_outlet.png")


def chilled_by_weekday(orders):
    """Fresh chilled orders per weekday: order count and average daily chilled volume."""
    f = orders[(orders.brand == "Fresh") & (orders.temp_requirement == "chilled")]
    counts = f.groupby("dow").size().reindex(range(7), fill_value=0)
    daily = f.groupby(["order_date", "dow"]).order_volume_m3.sum().groupby("dow").mean().reindex(range(7))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 4.8))
    x = np.arange(7)
    bars = ax1.bar(x, counts.values, color=COLOR["Fresh"], width=0.62)
    ax1.bar_label(bars, labels=[f"{v:,}" for v in counts.values], padding=3, fontsize=9.5, color=INK_2)
    ax1.set_title("Chilled orders")
    ax1.set_ylabel("Orders")
    ax1.yaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")

    bars = ax2.bar(x, daily.fillna(0).values, color=COLOR["Fresh"], width=0.62)
    ax2.bar_label(bars, labels=[f"{v:.0f} m³" if v == v else "no orders" for v in daily.values],
                  padding=3, fontsize=9.5, color=INK_2)
    ax2.set_title("Average chilled volume per day")
    ax2.set_ylabel("m³ per day (both depots)")

    for ax in (ax1, ax2):
        ax.set_xticks(x, DAYS)
        ax.grid(axis="x", visible=False)
        ax.margins(y=0.15)

    fig.suptitle(f"Fresh chilled orders by day of week ({len(f):,} orders)",
                 x=0.07, ha="left", fontsize=14, color=INK, y=1.03)
    fig.text(0.07, -0.02, "Day of week of order_date. Only Fresh has chilled orders. No orders are placed on Sundays.",
             fontsize=8.5, color=MUTED, va="top")
    save(fig, "Fresh", "chilled_orders_by_weekday.png")
    return pd.DataFrame({"orders": counts, "avg_daily_m3": daily.round(1)}).set_axis(DAYS)


def chilled_hist_by_weekday(orders, column, unit, label):
    """Fresh chilled order size histograms, one panel per weekday (Mon-Sat), on shared bins and axes."""
    f = orders[(orders.brand == "Fresh") & (orders.temp_requirement == "chilled")]
    hi = np.percentile(f[column], 99.5)  # same tail clip as the other histograms
    bins = np.linspace(0, hi, 40)
    overall = f[column].median()
    fig, axes = plt.subplots(2, 3, figsize=(15, 7.5), sharex=True, sharey=True)
    for d, ax in enumerate(axes.flat):
        vals = f.loc[f.dow == d, column]
        ax.hist(vals.clip(upper=hi), bins=bins, color=COLOR["Fresh"], edgecolor=SURFACE, linewidth=0.6)
        ax.axvline(overall, color=MUTED, lw=1, ls="--")
        med = vals.median()
        ax.axvline(med, color=INK, lw=1)
        ax.annotate(f"median {med:,.{0 if unit == 'kg' else 2}f} {unit}", (med, 1), xycoords=("data", "axes fraction"),
                    xytext=(4, -2), textcoords="offset points", fontsize=8.5, color=INK, va="top")
        ax.set_title(f"{DAYS[d]} ({len(vals):,} orders)")
        ax.grid(axis="x", visible=False)
        ax.yaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")
    for ax in axes[1]:
        ax.set_xlabel(f"{label.capitalize()} per order ({unit})")
    for ax in axes[:, 0]:
        ax.set_ylabel("Orders")
    fig.suptitle(f"Fresh chilled order {label} by day of week", x=0.07, ha="left", fontsize=14, color=INK, y=1.0)
    fig.text(0.07, -0.01, f"Day of week of order_date; no orders on Sundays. Solid line = that day's median, dashed = "
                          f"median over all days ({overall:,.{0 if unit == 'kg' else 2}f} {unit}).\nValues above the "
                          f"99.5th percentile ({hi:,.2f} {unit}) are shown in the last bin.",
             fontsize=8.5, color=MUTED, va="top")
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    save(fig, "Fresh", f"chilled_{label}_by_weekday_hist.png")
    return f.groupby("dow")[column].describe(percentiles=[0.5, 0.95])[["count", "mean", "50%", "95%"]].set_axis(DAYS[:6])


def main():
    orders, outlets = load()
    print(f"{len(orders):,} orders, {len(outlets)} outlets. Writing:")
    for who in BRANDS + ["All"]:
        sub = orders if who == "All" else orders[orders.brand == who]
        histogram(sub.order_weight_kg, who, "weight", "kg", "weight")
        histogram(sub.order_volume_m3, who, "volume", "m³", "volume")
        weekday_bars(sub, who)
    fresh = orders[orders.brand == "Fresh"]
    for kind, temp in [("chilled", "chilled"), ("dry", "ambient")]:
        sub = fresh[fresh.temp_requirement == temp]
        histogram(sub.order_weight_kg, "Fresh", "weight", "kg", "weight", kind)
        histogram(sub.order_volume_m3, "Fresh", "volume", "m³", "volume", kind)
    print(chilled_hist_by_weekday(orders, "order_volume_m3", "m³", "volume").round(2))
    print(chilled_hist_by_weekday(orders, "order_weight_kg", "kg", "weight").round(1))
    mall_windows(outlets)
    all_windows(outlets)
    chilled_by_outlet(orders, outlets, "order_volume_m3", "m³", "volume")
    chilled_by_outlet(orders, outlets, "order_weight_kg", "kg", "weight")
    print(chilled_by_weekday(orders))


if __name__ == "__main__":
    main()
