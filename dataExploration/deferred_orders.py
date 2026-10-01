"""Deferred-order charts.

Writes PNGs into All/. Orders come from deliveries_train.csv plus
task1_test_inputs.csv (Jan 2024 - Mar 2026). A deferred order is one with
dispatch_status == "deferred"; it is counted on its order_date.
"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
# The challenge data lives in the repo root, at Cryptonovate_TBD/data.
DATA = HERE.parent / "data"

BRANDS = ["Fresh", "Style", "Tech"]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
COLOR = {"Fresh": "#2a78d6", "Style": "#eb6834", "Tech": "#1baf7a"}

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
    return pd.concat([pd.read_csv(DATA / "Training Data/deliveries_train.csv"),
                      pd.read_csv(DATA / "Test Data/task1_test_inputs.csv")], ignore_index=True)


def save(fig, folder, name):
    out = HERE / folder
    out.mkdir(exist_ok=True)
    fig.savefig(out / name, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  {folder}/{name}")


# Fresh is split by temperature because almost all deferrals are Fresh chilled orders.
GROUPS = ["Fresh · chilled", "Fresh · ambient", "Style", "Tech"]


def group_of(orders):
    return np.where(orders.brand == "Fresh", "Fresh · " + orders.temp_requirement, orders.brand)


def deferred_by_brand(orders):
    g = pd.Series(group_of(orders), index=orders.index)
    total = g.groupby(g).size().reindex(GROUPS)
    deferred = g[orders.dispatch_status == "deferred"].pipe(lambda s: s.groupby(s).size()).reindex(GROUPS, fill_value=0)
    rate = deferred / total

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 4.8))
    colors = [COLOR[grp.split(" · ")[0]] for grp in GROUPS]
    x = np.arange(len(GROUPS))

    bars = ax1.bar(x, deferred.values, color=colors, width=0.6)
    ax1.bar_label(bars, labels=[f"{n:,}" for n in deferred.values], padding=3, fontsize=9.5, color=INK_2)
    ax1.set_title("Deferred orders")
    ax1.set_ylabel("Orders")
    ax1.yaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")

    bars = ax2.bar(x, rate.values * 100, color=colors, width=0.6)
    ax2.bar_label(bars, labels=[f"{r:.2%}\n({d:,} of {t:,})" for r, d, t in zip(rate, deferred, total)],
                  padding=3, fontsize=9, color=INK_2)
    ax2.set_title("Share of the brand's orders deferred")
    ax2.set_ylabel("% of orders")
    ax2.yaxis.set_major_formatter(lambda v, _: f"{v:g}%")

    for ax in (ax1, ax2):
        ax.set_xticks(x, GROUPS)
        ax.grid(axis="x", visible=False)
        ax.margins(y=0.2)

    fig.suptitle(f"Deferred orders by brand ({deferred.sum():,} of {total.sum():,} orders)",
                 x=0.07, ha="left", fontsize=14, color=INK, y=1.03)
    fig.text(0.07, -0.02, "Deferred = dispatch_status 'deferred', counted on order_date. "
                          "Orders not run (dispatch_status 'not_run') are not included.",
             fontsize=8.5, color=MUTED, va="top")
    save(fig, "All", "deferred_orders_by_brand.png")
    return pd.DataFrame({"orders": total, "deferred": deferred, "rate": rate.round(4)})


def deferred_by_weekday(orders):
    dow = pd.to_datetime(orders.order_date).dt.dayofweek
    total = orders.groupby(dow).size().reindex(range(7), fill_value=0)
    is_def = orders.dispatch_status == "deferred"
    deferred = orders[is_def].groupby(dow[is_def]).size().reindex(range(7), fill_value=0)
    days = orders.groupby(dow).order_date.nunique().reindex(range(7), fill_value=0)
    rate = (deferred / total.replace(0, np.nan)).fillna(0)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 4.8))
    x = np.arange(7)
    bars = ax1.bar(x, deferred.values, color=COLOR["Fresh"], width=0.62)
    ax1.bar_label(bars, labels=[f"{n:,}" for n in deferred.values], padding=3, fontsize=9.5, color=INK_2)
    ax1.set_title("Deferred orders")
    ax1.set_ylabel("Orders")
    ax1.yaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")

    bars = ax2.bar(x, rate.values * 100, color=COLOR["Fresh"], width=0.62)
    ax2.bar_label(bars, labels=[f"{r:.1%}" if t else "no orders" for r, t in zip(rate, total)],
                  padding=3, fontsize=9.5, color=INK_2)
    ax2.set_title("Share of that weekday's orders deferred")
    ax2.set_ylabel("% of orders")
    ax2.yaxis.set_major_formatter(lambda v, _: f"{v:g}%")

    for ax in (ax1, ax2):
        ax.set_xticks(x, DAYS)
        ax.grid(axis="x", visible=False)
        ax.margins(y=0.15)

    fig.suptitle(f"Deferred orders by day of week ({deferred.sum():,} orders)",
                 x=0.07, ha="left", fontsize=14, color=INK, y=1.03)
    fig.text(0.07, -0.02, "Day of week of order_date (the day the order was deferred). "
                          "1,625 of the 1,633 deferred orders are Fresh chilled; there are no orders on Sundays.",
             fontsize=8.5, color=MUTED, va="top")
    save(fig, "All", "deferred_orders_by_weekday.png")
    return pd.DataFrame({"days": days, "orders": total, "deferred": deferred,
                         "per_day": (deferred / days.replace(0, np.nan)).round(2),
                         "rate": rate.round(4)}, ).set_axis(DAYS)


def main():
    orders = load()
    print(f"{len(orders):,} orders. Writing:")
    print(deferred_by_brand(orders))
    print(deferred_by_weekday(orders))


if __name__ == "__main__":
    main()
