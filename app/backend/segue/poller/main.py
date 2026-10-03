"""Flight poller. The AirLabs allowance is small, so it polls only flights on a tracked
connection, slows down when the flight is far out, and stops once the flight has landed."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from ..core.breaker import BreakerOpen
from ..core.bus import kafka_producer
from ..core.db import Connection, FlightInstance, Itinerary, now, session
from ..flights.provider import BudgetSpent, provider
from ..flights.service import apply, publish_update

log = logging.getLogger("segue.poller")
TICK_S = 60


def interval(flight: FlightInstance, at: datetime) -> timedelta | None:
    """How often this flight is worth a query right now. None means stop polling it."""
    aware = lambda v: v.replace(tzinfo=timezone.utc) if v and v.tzinfo is None else v
    departure, arrival = aware(flight.est_dep or flight.sched_dep), aware(flight.est_arr or flight.sched_arr)
    if flight.status in ("landed", "cancelled") or (arrival and at > arrival + timedelta(hours=2)):
        return None
    if departure is None:
        return timedelta(hours=3)
    until = departure - at
    if until > timedelta(hours=6):
        return timedelta(hours=3)
    if until > timedelta(hours=1):
        return timedelta(minutes=30)
    return timedelta(minutes=10)  # close to departure or in the air: this is when delays and gates change


async def tick(producer) -> None:
    async with session() as db:
        tracked = select(FlightInstance).where(FlightInstance.source == "airlabs").where(
            FlightInstance.id.in_(select(Connection.inbound_id).join(Itinerary, Itinerary.connection_id == Connection.id))
            | FlightInstance.id.in_(select(Connection.outbound_id).join(Itinerary, Itinerary.connection_id == Connection.id))
        )
        for flight in (await db.execute(tracked)).scalars():
            every = interval(flight, now())
            polled = flight.polled_at.replace(tzinfo=timezone.utc) if flight.polled_at and flight.polled_at.tzinfo is None else flight.polled_at
            if every is None or (polled and now() - polled < every):
                continue
            try:
                data = await provider().fetch(flight.flight_iata)
            except (BudgetSpent, BreakerOpen) as stop:
                log.warning("polling paused: %s", stop)
                return  # the last known status stays, with its age shown
            except Exception as error:
                log.warning("poll failed for %s: %r", flight.flight_iata, error)
                continue
            flight.polled_at = now()
            changed = bool(data) and data["date"] == flight.date and apply(flight, data, "airlabs")
            await db.commit()
            if changed:
                await publish_update(producer, flight)
                log.info("%s changed, version %d", flight.flight_iata, flight.version)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    producer = await kafka_producer()
    log.info("poller running")
    try:
        while True:
            try:
                await tick(producer)
            except Exception as error:
                log.warning("poller tick failed: %r", error)
            await asyncio.sleep(TICK_S)
    finally:
        await producer.stop()


if __name__ == "__main__":
    asyncio.run(main())
