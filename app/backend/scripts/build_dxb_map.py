"""Turn an OpenStreetMap extract of Dubai International into the compact geometry the route map draws.

    python scripts/build_dxb_map.py <overpass.json>

Input: the Overpass API reply for aeroway=terminal ways, aeroway=gate nodes and runways inside
the airport's bounding box. Output: segue/data/dxb_map.json, with coordinates in metres on a
local flat projection (x east, y south), so distances on the map are real.

Map data (c) OpenStreetMap contributors, Open Database Licence. The attribution is drawn on every map.
"""
import json
import math
import re
import sys
from pathlib import Path

source = json.load(open(sys.argv[1], encoding="utf-8"))
elements = source["elements"]
nodes = {e["id"]: (e["lat"], e["lon"]) for e in elements if e["type"] == "node"}
LAT0, LON0 = 25.2532, 55.3657  # airport reference point
R = 6_371_000


def project(lat: float, lon: float) -> list[int]:
    x = math.radians(lon - LON0) * math.cos(math.radians(LAT0)) * R
    y = -math.radians(lat - LAT0) * R
    return [round(x), round(y)]


NAMES = {"Concourse A": "A", "Concourse B": "B", "Concourse C": "C", "Concourse D": "D", "Terminal 1": "T1", "Terminal 2": "T2", "Terminal 3": "T3"}
buildings, runways, gates = [], [], {}
for e in elements:
    tags = e.get("tags", {})
    if e["type"] == "way" and tags.get("aeroway") == "terminal":
        name = tags.get("name:en") or tags.get("name")
        buildings.append({"id": NAMES.get(name), "name": name, "outline": [project(*nodes[n]) for n in e["nodes"]]})
    elif e["type"] == "way" and tags.get("aeroway") == "runway":
        runways.append({"ref": tags.get("ref"), "line": [project(*nodes[n]) for n in e["nodes"]], "width": float(tags.get("width", 60))})
    elif e["type"] == "node" and tags.get("aeroway") == "gate" and tags.get("ref"):
        point = project(e["lat"], e["lon"])
        ref = tags["ref"].upper().replace(" ", "")
        # "C25/C27" and "C36-C50" are one mapped point for several gates.
        refs = []
        for part in ref.split("/"):
            match = re.fullmatch(r"([A-Z])(\d+)-[A-Z]?(\d+)", part)
            refs += [f"{match[1]}{n}" for n in range(int(match[2]), int(match[3]) + 1)] if match else [part]
        for one in refs:
            gates[one] = point

out = Path(__file__).resolve().parents[1] / "segue" / "data" / "dxb_map.json"
out.parent.mkdir(exist_ok=True)
json.dump({"source": "OpenStreetMap contributors (ODbL)", "reference": [LAT0, LON0], "buildings": buildings, "runways": runways, "gates": gates}, open(out, "w", encoding="utf-8"), separators=(",", ":"))
letters = {}
for ref in gates:
    letters[ref[0]] = letters.get(ref[0], 0) + 1
print(out, f"{out.stat().st_size / 1000:.0f} kB:", len(buildings), "buildings,", len(runways), "runways,", len(gates), "gates", letters)
