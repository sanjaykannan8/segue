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
    "walk": {},                 # "T1>T3": minutes, overrides the two defaults above
}


@lru_cache
def airport_config(airport: str) -> dict:
    """config/airports/<IATA>.yaml over the defaults. Unknown airports use the defaults."""
    config = dict(DEFAULT)
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


def _walk(config: dict, arr_terminal: str | None, dep_terminal: str | None) -> int:
    if arr_terminal and dep_terminal:
        specific = config["walk"].get(f"{arr_terminal}>{dep_terminal}")
        if specific is not None:
            return int(specific)
        if arr_terminal != dep_terminal:
            return int(config["walk_other_terminal_min"])
    return int(config["walk_same_terminal_min"])


def connection_buffer(airport: str, inbound_arrival: datetime, outbound_departure: datetime, arr_terminal: str | None, dep_terminal: str | None) -> Buffer:
    config = airport_config(airport)
    left = round((outbound_departure - inbound_arrival).total_seconds() / 60) - int(config["gate_close_min"])
    deplane, walk, queue = int(config["deplane_min"]), _walk(config, arr_terminal, dep_terminal), int(config["queue_min"])
    needed = deplane + walk + queue
    steps = (("deplane", "Leave the aircraft", deplane), ("walk", "Walk to the gate", walk), ("queue", "Transfer security", queue), ("gate", "Board", 0))
    return Buffer(left, needed, left - needed, steps)


def seat_row(seat: str | None) -> int | None:
    match = re.match(r"\s*(\d{1,2})", seat or "")
    return int(match.group(1)) if match else None


def passenger_offset(airport: str, base: Buffer, seat: str | None, assistance: str | None) -> int:
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
