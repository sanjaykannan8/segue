"""A vector map of Dubai International for the passenger's email, drawn from real geometry.

The building outlines, runways and gate positions come from OpenStreetMap (built into
segue/data/dxb_map.json by scripts/build_dxb_map.py), on a flat projection in metres, so the map
is to scale and carries a scale bar. Map data (c) OpenStreetMap contributors (ODbL): the
attribution is drawn on every map.

What is NOT surveyed is the passenger's path inside the buildings: OpenStreetMap has no indoor
routes for DXB. The line drawn joins the arrival gate, the two gate areas and the departure
gate, and is labelled as indicative.
"""
import json
from functools import lru_cache
from html import escape
from pathlib import Path

from .buffer import Transfer

DEEP, OCEAN, SKY, MIST, WHITE, EDGE, MUTED, GROUND = "#06283D", "#1363DF", "#47B5FF", "#DFF6FF", "#FFFFFF", "#9DB4C2", "#5B7385", "#CFE6F2"
W, H, TOP, PAD = 900, 700, 84, 44
NAMES = {"A": "A gates", "B": "B gates", "C": "C gates", "D": "D gates", "T1": "Terminal 1", "T2": "Terminal 2", "T3": "Terminal 3"}
# The building a gate letter belongs to. F gates are inside the Terminal 2 building.
HOME = {"A": "A", "B": "B", "C": "C", "D": "D", "F": "T2"}


@lru_cache
def _data() -> dict:
    return json.loads((Path(__file__).parents[1] / "data" / "dxb_map.json").read_text(encoding="utf-8"))


def _centre(outline: list[list[int]]) -> tuple[float, float]:
    xs, ys = [p[0] for p in outline], [p[1] for p in outline]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2


def gate_point(gate: str | None) -> tuple[float, float] | None:
    """Where a gate is, from the survey. None if this gate is not mapped."""
    point = _data()["gates"].get((gate or "").upper().replace(" ", ""))
    return (point[0], point[1]) if point else None


def route_map_svg(route: Transfer, arr_gate: str | None, dep_gate: str | None) -> str | None:
    """SVG of the airport with this transfer marked, or None when the gate areas are not known."""
    data = _data()
    buildings = {b["id"]: b for b in data["buildings"] if b["id"]}
    start_building, end_building = HOME.get(route.origin or ""), HOME.get(route.destination or "")
    if start_building not in buildings or end_building not in buildings:
        return None
    start = gate_point(arr_gate) or _centre(buildings[start_building]["outline"])
    end = gate_point(dep_gate) or _centre(buildings[end_building]["outline"])
    start_exact, end_exact = gate_point(arr_gate) is not None, gate_point(dep_gate) is not None
    # No indoor routes are surveyed, so the line simply joins the two gates: direction and distance, not corridors.
    path = [start, end]

    # Frame the two buildings involved, with room around them, at one scale for both axes.
    focus = [p for key in {start_building, end_building} for p in buildings[key]["outline"]] + [list(p) for p in path]
    min_x, max_x = min(p[0] for p in focus) - 260, max(p[0] for p in focus) + 260
    min_y, max_y = min(p[1] for p in focus) - 260, max(p[1] for p in focus) + 260
    scale = min((W - 2 * PAD) / (max_x - min_x), (H - TOP - 2 * PAD) / (max_y - min_y))
    off_x = PAD + ((W - 2 * PAD) - (max_x - min_x) * scale) / 2
    off_y = TOP + PAD + ((H - TOP - 2 * PAD) - (max_y - min_y) * scale) / 2
    sx = lambda x: round(off_x + (x - min_x) * scale, 1)
    sy = lambda y: round(off_y + (y - min_y) * scale, 1)
    poly = lambda points: " ".join(f"{sx(x)},{sy(y)}" for x, y in points)

    title = f"Dubai International: {arr_gate or NAMES[route.origin]} to {dep_gate or NAMES[route.destination]}, about {route.minutes} minutes"
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{escape(title)}" font-family="DejaVu Sans, Arial, sans-serif">',
        f'<defs><clipPath id="frame"><rect x="0" y="{TOP}" width="{W}" height="{H - TOP}" rx="0"/></clipPath></defs>',
        f'<rect width="{W}" height="{H}" rx="26" fill="{MIST}"/>',
        f'<text x="{PAD}" y="38" font-size="24" font-weight="700" fill="{DEEP}">Dubai International (DXB)</text>',
        f'<text x="{PAD}" y="64" font-size="16" fill="{MUTED}">{escape(route.how)}</text>',
        f'<text x="{W - PAD}" y="42" font-size="26" font-weight="700" fill="{OCEAN}" text-anchor="end">about {route.minutes} min</text>',
        f'<text x="{W - PAD}" y="64" font-size="13" fill="{MUTED}" text-anchor="end">{"time published by the airline" if route.sourced else "a planning estimate"}</text>',
        '<g clip-path="url(#frame)">',
    ]
    for runway in data["runways"]:
        out.append(f'<polyline points="{poly(runway["line"])}" fill="none" stroke="{GROUND}" stroke-width="{max(6, runway["width"] * scale):.1f}" stroke-linecap="butt"/>')
    for key, building in buildings.items():
        involved = key in (start_building, end_building)
        out.append(f'<polygon points="{poly(building["outline"])}" fill="{WHITE}" stroke="{OCEAN if involved else EDGE}" stroke-width="{2.5 if involved else 1.2}" stroke-linejoin="round"/>')
    for ref, (x, y) in data["gates"].items():
        if HOME.get(ref[0]) in (start_building, end_building):
            out.append(f'<circle cx="{sx(x)}" cy="{sy(y)}" r="2.6" fill="{EDGE}"/>')
    for key, building in buildings.items():
        cx, cy = _centre(building["outline"])
        if min_x < cx < max_x and min_y < cy < max_y:
            involved = key in (start_building, end_building)
            out.append(f'<text x="{sx(cx)}" y="{sy(cy) + 5}" font-size="{15 if involved else 12}" font-weight="{700 if involved else 400}" fill="{DEEP if involved else MUTED}" text-anchor="middle" stroke="{WHITE}" stroke-width="4" paint-order="stroke">{NAMES[key]}</text>')
    out.append(f'<polyline points="{poly(path)}" fill="none" stroke="{OCEAN}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 11"/>')

    def marker(point, label, filled, exact):
        x, y = sx(point[0]), sy(point[1])
        above = y > TOP + 70
        ty = y - 18 if above else y + 30
        width = 13 + len(label) * 8.6
        tx = min(max(x, PAD + width / 2), W - PAD - width / 2)
        return (
            f'<circle cx="{x}" cy="{y}" r="11" fill="{OCEAN if filled else WHITE}" stroke="{OCEAN}" stroke-width="4"/>'
            + ("" if exact else f'<circle cx="{x}" cy="{y}" r="19" fill="none" stroke="{OCEAN}" stroke-width="1.5" stroke-dasharray="3 4"/>')
            + f'<rect x="{tx - width / 2}" y="{ty - 17}" width="{width}" height="24" rx="12" fill="{DEEP}"/>'
            + f'<text x="{tx}" y="{ty}" font-size="14" font-weight="700" fill="{WHITE}" text-anchor="middle">{escape(label)}</text>'
        )

    out.append(marker(start, f"You land: {arr_gate}" if arr_gate else "You land here", False, start_exact))
    out.append(marker(end, f"Your gate: {dep_gate}" if dep_gate else "Your gate area", True, end_exact))
    out.append("</g>")

    # Scale bar: a round number of metres that fits.
    metres = next(m for m in (500, 250, 200, 100, 50) if m * scale <= 190)
    bar_x, bar_y = PAD, H - 30
    out.append(f'<line x1="{bar_x}" y1="{bar_y}" x2="{bar_x + metres * scale:.1f}" y2="{bar_y}" stroke="{DEEP}" stroke-width="3"/>')
    out.append(f'<text x="{bar_x + metres * scale + 8:.1f}" y="{bar_y + 5}" font-size="13" fill="{DEEP}">{metres} m</text>')
    # North is up (the projection keeps north at the top).
    out.append(f'<text x="{W - PAD}" y="{TOP + 26}" font-size="13" font-weight="700" fill="{MUTED}" text-anchor="end">N ↑</text>')
    out.append(f'<text x="{W - PAD}" y="{H - 34}" font-size="11.5" fill="{MUTED}" text-anchor="end">Buildings and gates to scale. The dotted line is indicative, not an indoor route.</text>')
    out.append(f'<text x="{W - PAD}" y="{H - 16}" font-size="11.5" fill="{MUTED}" text-anchor="end">Map data © OpenStreetMap contributors</text>')
    out.append("</svg>")
    return "".join(out)


def svg_to_png(svg: str) -> bytes | None:
    """PNG for mail clients that do not draw SVG. None if no renderer is installed: the SVG is still attached."""
    try:
        import resvg_py

        return bytes(resvg_py.svg_to_bytes(svg_string=svg, width=W * 2))
    except Exception:
        return None
