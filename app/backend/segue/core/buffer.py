"""The time arithmetic. Exact, auditable, and done in code, never by the model.

left   = minutes from the inbound's estimated arrival to the outbound's gate closing
needed = minutes the transfer takes: deplane + walk + queue (from the airport config)
buffer = left - needed

The connection-level figures are shared by everyone on the flight pair. The
per-passenger adjustment is a small offset on top (seat row, declared assistance).
"""
import re
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import yaml

from .settings import get_settings

DEFAULT = {
    "gate_close_min": 20,       # the gate closes this long before departure
    "deplane_min": 8,           # time for a mid-cabin passenger to get off
    "deplane_per_row_s": 12,    # extra seconds per seat row behind the door
    "walk_same_terminal_min": 10,
    "walk_other_terminal_min": 22,
    "queue_min": 8,             # transfer security, when no live figure exists
    "assistance_factor": {"wheelchair": 1.5, "buggy": 0.8, "escort": 1.0, "step_free_route": 1.3},
    # Separate tickets: collect the bag, go landside, check in and clear security again.
    "self_transfer_extra_min": 35,
    "walk": {},                 # "T1>T3": minutes, overrides the two defaults above
}


@lru_cache(maxsize=64)
def airport_config(airport: str) -> dict:
    """config/airports/<IATA>.yaml over the defaults. Unknown airports use the defaults."""
    config = dict(DEFAULT)
    if not re.fullmatch(r"[A-Za-z]{3,4}", airport or ""):
        return config
    path = Path(get_settings().airports_dir) / f"{airport.upper()}.yaml"
    if path.exists():
        config.update(yaml.safe_load(path.read_text()) or {})
    return config


@dataclass(frozen=True)
class Buffer:
    left_min: int
    needed_min: int
    buffer_min: int
    steps: tuple[tuple[str, str, int], ...]  # (id, label, minutes)


@dataclass(frozen=True)
class Transfer:
    """Getting from the arrival gate to the departure gate."""
    minutes: int
    how: str                 # in words, e.g. "Airport train between the A and B gates"
    origin: str | None       # concourse letter, when known
    destination: str | None
    sourced: bool            # True: an airline or the airport published the figure. False: our estimate


def concourse(config: dict, gate: str | None, terminal: str | None) -> str | None:
    """The concourse a flight uses: from the gate's letter, else from a terminal that has only one."""
    known = config.get("concourses") or {}
    if gate and gate.strip()[:1].upper() in known:
        return gate.strip()[:1].upper()
    return (config.get("terminal_concourse") or {}).get(str(terminal).lstrip("Tt")) if terminal else None


def transfer(config: dict, arr_terminal: str | None, dep_terminal: str | None, arr_gate: str | None = None, dep_gate: str | None = None) -> Transfer:
    """Minutes from arrival gate to departure gate. Airports with a `transfer` table (DXB) use the
    concourse pair; others fall back to same-terminal and other-terminal defaults."""
    table = config.get("transfer")
    if table:
        origin, destination = concourse(config, arr_gate, arr_terminal), concourse(config, dep_gate, dep_terminal)
        if origin and destination:
            entry = table.get(f"{origin}-{destination}") or table.get(f"{destination}-{origin}")
            if entry:
                return Transfer(int(entry["min"]), entry["how"], origin, destination, bool(entry.get("sourced")))
        return Transfer(int(config.get("unknown_min", config["walk_other_terminal_min"])), "Walk or ride to the departure gate (gate not yet known)", origin, destination, False)
    if arr_terminal and dep_terminal:
        specific = config["walk"].get(f"{arr_terminal}>{dep_terminal}")
        if specific is not None:
            return Transfer(int(specific), "Walk to the gate", None, None, False)
        if arr_terminal != dep_terminal:
            return Transfer(int(config["walk_other_terminal_min"]), "Go to the other terminal", None, None, False)
    return Transfer(int(config["walk_same_terminal_min"]), "Walk to the gate", None, None, False)


def connection_buffer(airport: str, inbound_arrival: datetime, outbound_departure: datetime, arr_terminal: str | None, dep_terminal: str | None, arr_gate: str | None = None, dep_gate: str | None = None) -> Buffer:
    config = airport_config(airport)
    left = round((outbound_departure - inbound_arrival).total_seconds() / 60) - int(config["gate_close_min"])
    route = transfer(config, arr_terminal, dep_terminal, arr_gate, dep_gate)
    deplane, queue = int(config["deplane_min"]), int(config["queue_min"])
    needed = deplane + route.minutes + queue
    steps = (("deplane", "Leave the aircraft", deplane), ("walk", route.how, route.minutes), ("queue", "Transfer security", queue), ("gate", "Board", 0))
    return Buffer(left, needed, left - needed, steps)


def changes_terminal(airport: str, arr_terminal: str | None, dep_terminal: str | None, arr_gate: str | None, dep_gate: str | None) -> bool:
    """True when the transfer leaves the arrival terminal (a bus or a train to another terminal)."""
    config = airport_config(airport)
    known = config.get("concourses") or {}
    origin, destination = concourse(config, arr_gate, arr_terminal), concourse(config, dep_gate, dep_terminal)
    if origin in known and destination in known:
        return known[origin]["terminal"] != known[destination]["terminal"]
    return bool(arr_terminal and dep_terminal and str(arr_terminal) != str(dep_terminal))


def seat_row(seat: str | None) -> int | None:
    match = re.match(r"\s*(\d{1,2})", seat or "")
    return int(match.group(1)) if match else None


def passenger_offset(airport: str, base: Buffer, seat: str | None, assistance: str | None, booking: str = "single_ticket") -> int:
    """Minutes to subtract from the connection buffer for this passenger (negative means more time)."""
    config = airport_config(airport)
    offset = 0.0
    row = seat_row(seat)
    if row is not None:
        # The shared figure assumes a mid-cabin seat (row 20). Rows behind it get off later, rows ahead sooner.
        offset += (row - 20) * float(config["deplane_per_row_s"]) / 60
    if assistance and assistance != "none":
        walk = next(minutes for step, _, minutes in base.steps if step == "walk")
        offset += walk * (float(config["assistance_factor"].get(assistance, 1.0)) - 1.0)
    if booking == "separate_tickets":
        offset += float(config["self_transfer_extra_min"])
    return round(offset)


def rule_level(buffer_min: int) -> str:
    """Fixed thresholds on the buffer: the fallback when the model is unavailable."""
    s = get_settings()
    if buffer_min >= s.rule_safe_min:
        return "safe"
    if buffer_min >= s.rule_tight_min:
        return "tight"
    if buffer_min >= s.rule_risk_min:
        return "at_risk"
    return "lost"


BAND = {"safe": "comfortable", "tight": "small", "at_risk": "negative_or_near_zero", "lost": "far_too_short"}


def margin_band(buffer_min: int) -> str:
    """The buffer as a named band for the model, which judges categories better than it compares numbers.
    The cut-offs are the same ones the rule fallback uses."""
    return BAND[rule_level(buffer_min)]
