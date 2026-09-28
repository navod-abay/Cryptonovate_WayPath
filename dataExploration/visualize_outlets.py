"""Network view of all outlets: depots -> districts -> outlets.

Graph (networkx):
  * depot nodes (Peliyagoda, Kandy) and one node per outlet
  * depot -- outlet edges, weight = depot_to_district_km of the outlet's district
  * outlet -- outlet edges between every pair in the same district,
    weight = inter_stop_km of that district

Layout: each district sits on a spoke from its depot. The spoke length is the
real depot_to_district_km, and its direction is the approximate compass bearing
of the district, so the picture reads like a map. Outlets are spread in a
cluster around their district point. The cluster size is only for readability;
the km values in the labels are the real distances.
"""
import math
from pathlib import Path

import matplotlib.pyplot as plt
import networkx as nx
import pandas as pd
from matplotlib.lines import Line2D

# The challenge data lives outside the repo, next to it in TechTriathlon2026/.
DATA = Path(__file__).resolve().parents[2] / "data-20260926T041005Z-1-001/data/General Data"
OUT = Path(__file__).parent / "outlets_network.png"

# Approximate (lat, lon), used ONLY to choose the direction of each spoke.
GEO = {
    "Peliyagoda": (6.96, 79.88), "Kandy depot": (7.29, 80.63),
    "Colombo": (6.90, 79.86), "Gampaha": (7.09, 80.00), "Kalutara": (6.58, 79.96),
    "Galle": (6.05, 80.22), "Matara": (5.95, 80.54), "Kurunegala": (7.49, 80.36),
    "Puttalam": (8.03, 79.83), "Kandy": (7.29, 80.63), "Matale": (7.47, 80.62),
    "Nuwara Eliya": (6.97, 80.78), "Badulla": (6.99, 81.06), "Kegalle": (7.25, 80.35),
}
DEPOT_NODE = {"Peliyagoda": "Peliyagoda", "Kandy": "Kandy depot"}
# Districts right next to their depot get a fixed direction so they don't cover it
# or a neighbouring district (degrees, 0 = east).
BEARING_OVERRIDE = {"Colombo": -165, "Kandy": -115}
# Label direction for crowded districts (degrees); others use the spoke direction.
LABEL_DIR = {"Gampaha": 160, "Kegalle": 90, "Kandy": -90, "Matale": 0, "Kurunegala": 150}
SPACING = 2.6  # km between neighbouring outlets in the drawn cluster (display only)

# Colour = dock type (validated categorical slots 1-3); marker = parking constraint.
DOCK_COLOR = {"rear_dock": "#2a78d6", "street": "#eb6834", "mall_bay": "#1baf7a"}
PARKING_MARKER = {"normal": "o", "van_only": "^", "mall_dock": "s"}

SURFACE, INK, INK_2, MUTED, HAIRLINE = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9"


def to_km(lat, lon, lat0=6.96, lon0=79.88):
    return ((lon - lon0) * 111.32 * math.cos(math.radians(lat0)), (lat - lat0) * 110.57)


def build_graph(outlets, travel):
    G = nx.Graph()
    for depot, node in DEPOT_NODE.items():
        G.add_node(node, kind="depot", depot=depot)
    for r in outlets.itertuples():
        G.add_node(r.outlet_id, kind="outlet", brand=r.brand, district=r.district,
                   depot=r.depot, dock_type=r.dock_type, parking=r.parking_constraint)
    for t in travel.itertuples():
        members = outlets.loc[outlets.district == t.district, "outlet_id"].tolist()
        for o in members:
            G.add_edge(DEPOT_NODE[t.depot], o, kind="depot", km=t.depot_to_district_km,
                       freeflow_min=t.depot_to_district_freeflow_min)
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                G.add_edge(a, b, kind="intra", km=t.inter_stop_km,
                           freeflow_min=t.inter_stop_freeflow_min)
    return G


def layout(G, outlets, travel):
    pos = {node: to_km(*GEO[node]) for node in DEPOT_NODE.values()}
    centers, angles = {}, {}
    for t in travel.itertuples():
        dx, dy = pos[DEPOT_NODE[t.depot]]
        gx, gy = to_km(*GEO[t.district])
        if t.district in BEARING_OVERRIDE:
            ang = math.radians(BEARING_OVERRIDE[t.district])
        else:
            ang = math.atan2(gy - dy, gx - dx)
        angles[t.district] = ang
        centers[t.district] = (dx + t.depot_to_district_km * math.cos(ang),
                               dy + t.depot_to_district_km * math.sin(ang))
    # Sunflower packing around the district point, grouped by dock type.
    golden = math.pi * (3 - math.sqrt(5))
    for district, grp in outlets.sort_values(["dock_type", "parking_constraint"]).groupby("district"):
        cx, cy = centers[district]
        for k, oid in enumerate(grp.outlet_id):
            r = SPACING * math.sqrt(k + 0.5)
            pos[oid] = (cx + r * math.cos(k * golden), cy + r * math.sin(k * golden))
    return pos, centers, angles


def main():
    outlets = pd.read_csv(DATA / "outlets.csv")
    travel = pd.read_csv(DATA / "district_travel.csv")
    G = build_graph(outlets, travel)
    pos, centers, angles = layout(G, outlets, travel)

    fig, ax = plt.subplots(figsize=(15, 13), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)

    # Outlet-to-outlet edges (same district), as faint hairlines.
    intra = [(u, v) for u, v, d in G.edges(data=True) if d["kind"] == "intra"]
    nx.draw_networkx_edges(G, pos, edgelist=intra, edge_color=HAIRLINE, width=0.5, alpha=0.6, ax=ax)

    # Depot-to-district spokes: one line per district to keep it readable.
    # The graph itself still has an edge from the depot to every outlet.
    for t in travel.itertuples():
        (x0, y0), (x1, y1) = pos[DEPOT_NODE[t.depot]], centers[t.district]
        ax.plot([x0, x1], [y0, y1], color=MUTED, lw=1.5, zorder=1)

    # Outlets: colour = dock type, marker = parking constraint.
    for (dock, park), grp in outlets.groupby(["dock_type", "parking_constraint"]):
        nx.draw_networkx_nodes(G, pos, nodelist=grp.outlet_id.tolist(), node_color=DOCK_COLOR[dock],
                               node_shape=PARKING_MARKER[park], node_size=70,
                               edgecolors=SURFACE, linewidths=1.0, ax=ax)

    # Depots.
    depots = list(DEPOT_NODE.values())
    nx.draw_networkx_nodes(G, pos, nodelist=depots, node_color=INK, node_shape="*",
                           node_size=520, edgecolors=SURFACE, linewidths=1.5, ax=ax).set_zorder(6)
    depot_label = {"Peliyagoda": ((-14, 12), "right"), "Kandy depot": ((14, 12), "left")}
    for d in depots:
        (ox, oy), ha = depot_label[d]
        ax.annotate(f"{d.replace(' depot', '')} depot", pos[d], xytext=(ox, oy), textcoords="offset points",
                    ha=ha, fontsize=11, weight="bold", color=INK, zorder=7,
                    bbox=dict(boxstyle="round,pad=0.2", fc=SURFACE, ec="none", alpha=0.85))

    # District labels on the far side of each cluster from its depot.
    counts = outlets.district.value_counts()
    for t in travel.itertuples():
        cx, cy = centers[t.district]
        ang = math.radians(LABEL_DIR[t.district]) if t.district in LABEL_DIR else angles[t.district]
        spread = SPACING * math.sqrt(counts[t.district]) + 3
        c, s = math.cos(ang), math.sin(ang)
        ha = "left" if c > 0.35 else "right" if c < -0.35 else "center"
        va = "bottom" if s > 0.35 else "top" if s < -0.35 else "center"
        ax.annotate(f"{t.district}  ·  {t.depot_to_district_km} km from depot\n"
                    f"{counts[t.district]} outlets, {t.inter_stop_km:g} km apart",
                    (cx + spread * c, cy + spread * s), ha=ha, va=va, fontsize=8.5,
                    color=INK_2, linespacing=1.35, multialignment=ha if ha != "center" else "center", zorder=5,
                    bbox=dict(boxstyle="round,pad=0.25", fc=SURFACE, ec="none", alpha=0.85))

    # Legends: colour and marker are separate encodings, so they get separate keys.
    dock_handles = [Line2D([], [], marker="o", ls="", ms=9, mfc=c, mec=SURFACE, label=k.replace("_", " "))
                    for k, c in DOCK_COLOR.items()]
    park_handles = [Line2D([], [], marker=m, ls="", ms=9, mfc=MUTED, mec=SURFACE, label=k.replace("_", " "))
                    for k, m in PARKING_MARKER.items()]
    park_handles.append(Line2D([], [], marker="*", ls="", ms=14, mfc=INK, mec=SURFACE, label="depot"))
    kw = dict(frameon=False, fontsize=10, title_fontsize=10, labelcolor=INK_2, alignment="left")
    leg1 = ax.legend(handles=dock_handles, title="Colour · dock type", loc="lower left",
                     bbox_to_anchor=(0.0, 0.17), **kw)
    ax.add_artist(leg1)
    ax.legend(handles=park_handles, title="Marker · parking constraint", loc="lower left", **kw)

    ax.set_title("Outlet network: 120 outlets across 12 districts, served from 2 depots",
                 loc="left", fontsize=15, color=INK, pad=14)
    fig.text(0.125, 0.07,
             "Spoke length = depot-to-district distance (to scale, km). Spoke direction is the approximate "
             "compass bearing\n(Colombo and Kandy are turned slightly so they don't cover their depot). Outlets are spread around their district for readability.\nGrey hairlines join "
             "outlets in the same district; every pair is the fixed inter-stop distance shown in the district label.",
             fontsize=9, color=MUTED, va="top")

    ax.set_aspect("equal")
    ax.axis("off")
    ax.margins(0.06)
    fig.savefig(OUT, dpi=150, bbox_inches="tight", facecolor=SURFACE)
    print(f"{G.number_of_nodes()} nodes, {G.number_of_edges()} edges "
          f"({sum(d['kind'] == 'depot' for *_, d in G.edges(data=True))} depot-outlet, {len(intra)} outlet-outlet)")
    print(f"saved {OUT}")


if __name__ == "__main__":
    main()
