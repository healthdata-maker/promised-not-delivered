# Generates aggregate data visualisations from data.json.
# Runs on every pipeline execution. Output: static SVG files in charts/
# All charts use the site's dark editorial aesthetic.

import json
import os
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

ROOT = Path(__file__).parent.parent
DATA_FILE = ROOT / "data.json"
CHARTS_DIR = ROOT / "charts"

DARK_BG = "#0D0D0F"
OFF_WHITE = "#E8E4DC"
ACCENT = "#C9A96E"

ORG_COLORS = {
    "UNICEF": "#00AEEF",
    "WHO": "#008DC9",
    "USAID": "#4A72B0",
    "GAVI": "#8B1A4A",
    "World Bank": "#009FDA",
    "Other": "#6B7280"
}

PROMISE_LABELS = {
    "community_ownership": "Communities will lead",
    "context_sensitivity": "Context-specific",
    "participation": "Participatory approach",
    "sustainability": "Sustainable beyond project",
    "equity": "Reaching the most vulnerable"
}

def load_data():
    if not DATA_FILE.exists():
        return {"documents": [], "promise_counts": {}}
    with open(DATA_FILE) as f:
        return json.load(f)

def setup_ax(ax, title):
    ax.set_facecolor(DARK_BG)
    ax.tick_params(colors=OFF_WHITE, labelsize=8)
    ax.spines[:].set_color("#2A2A2E")
    ax.title.set_color(OFF_WHITE)
    ax.set_title(title, fontsize=10, pad=12, color=OFF_WHITE, fontfamily="monospace")

def chart_promise_counts(data):
    counts = data.get("promise_counts", {})
    if not counts or sum(counts.values()) == 0:
        return

    labels = [PROMISE_LABELS.get(k, k) for k in counts]
    values = list(counts.values())

    fig, ax = plt.subplots(figsize=(8, 4), facecolor=DARK_BG)
    bars = ax.barh(labels, values, color=ACCENT, edgecolor=DARK_BG, height=0.6)

    for bar, val in zip(bars, values):
        ax.text(bar.get_width() + 0.3, bar.get_y() + bar.get_height()/2,
                str(val), va='center', color=OFF_WHITE, fontsize=9, fontfamily="monospace")

    setup_ax(ax, "Promise frequency across all documents")
    ax.set_xlabel("Number of instances", color=OFF_WHITE, fontsize=8, fontfamily="monospace")
    ax.set_xlim(0, max(values) * 1.15 if values else 1)

    fig.tight_layout(pad=1.5)
    CHARTS_DIR.mkdir(exist_ok=True)
    fig.savefig(str(CHARTS_DIR / "promise_counts.svg"), format="svg", facecolor=DARK_BG, bbox_inches="tight")
    plt.close(fig)

def chart_timeline_scatter(data):
    docs = [d for d in data.get("documents", []) if d.get("year")]
    if not docs:
        return

    years = [int(d["year"]) for d in docs]
    orgs = [d.get("org", "Other") for d in docs]
    types = [d.get("doc_type", "other") for d in docs]
    colors = [ORG_COLORS.get(o, "#6B7280") for o in orgs]
    markers = ["o" if t == "strategy" else "D" if t == "evaluation" else "s" for t in types]

    fig, ax = plt.subplots(figsize=(10, 4), facecolor=DARK_BG)

    for year, color, marker in zip(years, colors, markers):
        ax.scatter(year, 0.5, c=color, marker=marker, s=80, alpha=0.8, zorder=3)

    ax.set_ylim(0, 1)
    ax.set_yticks([])
    ax.axhline(0.5, color="#2A2A2E", linewidth=1, zorder=1)

    setup_ax(ax, "Documents by year — ● strategy  ◆ evaluation")
    ax.set_xlabel("Year", color=OFF_WHITE, fontsize=8, fontfamily="monospace")

    legend_patches = [mpatches.Patch(color=c, label=o) for o, c in ORG_COLORS.items() if o != "Other"]
    ax.legend(handles=legend_patches, loc="upper left", fontsize=7,
              facecolor="#1A1A1D", edgecolor="#2A2A2E", labelcolor=OFF_WHITE)

    fig.tight_layout(pad=1.5)
    fig.savefig(str(CHARTS_DIR / "promise_timeline.svg"), format="svg", facecolor=DARK_BG, bbox_inches="tight")
    plt.close(fig)

def chart_org_breakdown(data):
    docs = data.get("documents", [])
    if not docs:
        return

    from collections import Counter
    org_type_counts = {}
    for d in docs:
        org = d.get("org", "Other")
        dtype = d.get("doc_type", "other")
        if org not in org_type_counts:
            org_type_counts[org] = {"strategy": 0, "evaluation": 0, "other": 0}
        org_type_counts[org][dtype] = org_type_counts[org].get(dtype, 0) + 1

    orgs = list(org_type_counts.keys())
    strat = [org_type_counts[o]["strategy"] for o in orgs]
    evalu = [org_type_counts[o]["evaluation"] for o in orgs]

    x = np.arange(len(orgs))
    w = 0.35

    fig, ax = plt.subplots(figsize=(8, 4), facecolor=DARK_BG)
    ax.bar(x - w/2, strat, w, label="Strategy", color=ACCENT, edgecolor=DARK_BG)
    ax.bar(x + w/2, evalu, w, label="Evaluation", color="#5A8FA8", edgecolor=DARK_BG)

    ax.set_xticks(x)
    ax.set_xticklabels(orgs, fontsize=8, color=OFF_WHITE, fontfamily="monospace")
    ax.legend(fontsize=8, facecolor="#1A1A1D", edgecolor="#2A2A2E", labelcolor=OFF_WHITE)

    setup_ax(ax, "Documents by organisation and type")
    ax.set_ylabel("Count", color=OFF_WHITE, fontsize=8, fontfamily="monospace")

    fig.tight_layout(pad=1.5)
    fig.savefig(str(CHARTS_DIR / "org_breakdown.svg"), format="svg", facecolor=DARK_BG, bbox_inches="tight")
    plt.close(fig)

def run_chart_generator():
    data = load_data()
    if not data.get("documents"):
        print("No data yet - skipping chart generation")
        return
    CHARTS_DIR.mkdir(exist_ok=True)
    chart_promise_counts(data)
    chart_timeline_scatter(data)
    chart_org_breakdown(data)
    print("Charts generated: promise_counts.svg, promise_timeline.svg, org_breakdown.svg")
