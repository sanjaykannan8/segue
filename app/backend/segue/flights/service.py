"""Flight rows: create, update with a version bump, and the view sent to the UI."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.bus import TOPIC_FLIGHT
from ..core.db import FlightInstance, now, uid

# A change in any of these is a new data version: the cached risk for the flight's connections is no longer served.
MATERIAL = ("est_dep", "est_arr", "dep_terminal", "dep_gate", "arr_terminal", "arr_gate", "status")
ALL = ("origin", "dest", "sched_dep", "sched_arr") + MATERIAL


def _aware(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def view(flight: FlightInstance) -> dict:
    iso = lambda v: _aware(v).isoformat() if v else None
    delay = 0
    if flight.est_arr and flight.sched_arr:
        delay = round((_aware(flight.est_arr) - _aware(flight.sched_arr)).total_seconds() / 60)
    return {
        "id": flight.id, "flight_iata": flight.flight_iata, "date": flight.date, "origin": flight.origin, "dest": flight.dest,
        "sched_dep": iso(flight.sched_dep), "est_dep": iso(flight.est_dep), "sched_arr": iso(flight.sched_arr), "est_arr": iso(flight.est_arr),
        "dep_terminal": flight.dep_terminal, "dep_gate": flight.dep_gate, "arr_terminal": flight.arr_terminal, "arr_gate": flight.arr_gate,
        "status": flight.status, "delay_min": delay, "version": flight.version,
        "updated_at": iso(flight.updated_at), "age_sec": max(0, round((now() - _aware(flight.updated_at)).total_seconds())),
        "source": flight.source,
    }


async def upsert(db: AsyncSession, data: dict, source: str) -> tuple[FlightInstance, bool]:
    """Create the flight or apply new data. Returns (flight, changed). Manual overrides from the console win over the provider."""
    flight = (await db.execute(select(FlightInstance).where(FlightInstance.flight_iata == data["flight_iata"], FlightInstance.date == data["date"]))).scalar_one_or_none()
    if flight is None:
        flight = FlightInstance(id=uid(), flight_iata=data["flight_iata"], date=data["date"], source=source, overrides={}, version=1, **{k: data.get(k) for k in ALL if k != "status"}, status=data.get("status") or "scheduled")
        flight.est_dep = flight.est_dep or flight.sched_dep
        flight.est_arr = flight.est_arr or flight.sched_arr
        db.add(flight)
        return flight, True
    return flight, apply(flight, data, source)


def apply(flight: FlightInstance, fields: dict, source: str) -> bool:
    """Apply field changes. Bumps the version only when something material changed."""
    changed = False
    overrides = dict(flight.overrides or {})
    for name in ALL:
        if name not in fields or fields[name] is None:
            continue
        if source != "manual" and name in overrides:
            continue  # set by hand on the console; the poller must not undo it
        new = fields[name]
        old = getattr(flight, name)
        if isinstance(new, datetime):
            new, old = _aware(new), _aware(old)
        if new != old:
            setattr(flight, name, fields[name])
            changed = changed or name in MATERIAL
            if source == "manual":
                overrides[name] = True
    flight.overrides = overrides
    if changed:
        flight.version += 1
        flight.updated_at = now()
    return changed


async def publish_update(producer, flight: FlightInstance, event_id: str | None = None) -> None:
    """Keyed by flight id, so one flight's events stay in order on its partition."""
    await producer.send_and_wait(TOPIC_FLIGHT, key=flight.id, value={"type": "flight.updated", "event_id": event_id or uid(), "flight_id": flight.id, "version": flight.version})
