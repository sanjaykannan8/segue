"""Scalability benchmark. Runs inside a backend container, against the live stack, without the flight API.

    docker compose exec api python -m segue.bench --connections 50 --passengers 20 --label "fake model, 1 engine"

It seeds made-up connections at Dubai International (C gates to B gates, 95 minutes apart) with
made-up passengers, then delays every inbound flight by 25 minutes at once: one flight event per
connection, published straight to Redpanda. That drives the whole pipeline: engine, model,
Postgres outbox, relay, RabbitMQ and consumers. It then reads the timing records the services
wrote and prints one JSON result. Everything it created is erased afterwards.

No real person's data and no AirLabs query is involved.
"""
import argparse
import asyncio
import json
import statistics
import time
from datetime import timedelta

from sqlalchemy import delete, func, select

from .core.bus import kafka_producer, redis
from .core.db import Connection, ConnectionRisk, Consent, DataPrincipal, Decision, FeedItem, FlightInstance, Itinerary, Outbox, PassengerPII, ProcessedMessage, now, session, uid
from .core.settings import get_settings
from .flights.service import apply, publish_update


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(p * (len(ordered) - 1)))]


def summary(values: list[float]) -> dict:
    return {"p50": round(percentile(values, 0.5)), "p95": round(percentile(values, 0.95)), "p99": round(percentile(values, 0.99)), "max": round(max(values)), "mean": round(statistics.fmean(values))} if values else {}


async def seed(run: str, connections: int, passengers: int) -> list[tuple[str, str]]:
    """Returns (inbound flight id, connection id) per connection."""
    out = []
    arrival = now().replace(second=0, microsecond=0) + timedelta(hours=2)
    departure = arrival + timedelta(minutes=95)
    async with session() as db:
        for c in range(connections):
            inbound = FlightInstance(id=uid(), flight_iata=f"Z{run}{c:04d}A"[:10], date=arrival.strftime("%Y-%m-%d"), origin="DEL", dest="DXB", sched_dep=arrival - timedelta(hours=3), est_dep=arrival - timedelta(hours=3), sched_arr=arrival, est_arr=arrival, arr_terminal="3", arr_gate="C22", status="en-route", source="manual", overrides={})
            outbound = FlightInstance(id=uid(), flight_iata=f"Z{run}{c:04d}B"[:10], date=departure.strftime("%Y-%m-%d"), origin="DXB", dest="LHR", sched_dep=departure, est_dep=departure, sched_arr=departure + timedelta(hours=7), est_arr=departure + timedelta(hours=7), dep_terminal="3", dep_gate="B14", status="scheduled", source="manual", overrides={})
            db.add_all([inbound, outbound])
            await db.flush()
            connection = Connection(id=uid(), inbound_id=inbound.id, outbound_id=outbound.id, airport="DXB")
            db.add(connection)
            people = [DataPrincipal(id=uid()) for _ in range(passengers)]
            db.add_all(people)
            await db.flush()  # parents first: the rows below point at them
            for p, principal in enumerate(people):
                db.add(PassengerPII(principal_id=principal.id, language="en"))
                db.add(Consent(principal_id=principal.id, purpose="tracking", notice_version="bench"))
                db.add(Consent(principal_id=principal.id, purpose="notifications", notice_version="bench"))
                db.add(Itinerary(id=uid(), principal_id=principal.id, connection_id=connection.id, seat=f"{5 + (p * 3) % 40}{'ABCDEF'[p % 6]}", booking="single_ticket" if p % 8 else "separate_tickets", expires_at=departure + timedelta(hours=1)))
            await db.flush()
            out.append((inbound.id, connection.id))
            if c % 25 == 24:
                await db.commit()
        await db.commit()
    return out


async def cleanup() -> None:
    """Remove everything any benchmark run created (its people carry the notice version "bench"), in bulk."""
    async with session() as db:
        people = select(Consent.principal_id).where(Consent.notice_version == "bench")
        connection_ids = list((await db.execute(select(Itinerary.connection_id).where(Itinerary.principal_id.in_(people)).distinct())).scalars())
        flights = [f for pair in (await db.execute(select(Connection.inbound_id, Connection.outbound_id).where(Connection.id.in_(connection_ids)))).all() for f in pair]
        principal_ids = list((await db.execute(people.distinct())).scalars())
        for table, column in ((FeedItem, FeedItem.connection_id), (Decision, Decision.connection_id), (ConnectionRisk, ConnectionRisk.connection_id), (Itinerary, Itinerary.connection_id)):
            await db.execute(delete(table).where(column.in_(connection_ids)))
        for table, column in ((PassengerPII, PassengerPII.principal_id), (Consent, Consent.principal_id), (DataPrincipal, DataPrincipal.id)):
            await db.execute(delete(table).where(column.in_(principal_ids)))
        await db.execute(delete(Connection).where(Connection.id.in_(connection_ids)))
        await db.execute(delete(FlightInstance).where(FlightInstance.id.in_(flights)))
        await db.execute(delete(Outbox).where(Outbox.sent_at.is_not(None)))
        await db.execute(delete(ProcessedMessage))
        await db.commit()


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--connections", type=int, default=20)
    parser.add_argument("--passengers", type=int, default=10)
    parser.add_argument("--label", default="")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()

    run = uid()[:4].upper()
    client = redis()
    await cleanup()  # anything an interrupted run left behind
    await client.delete("metrics:events", "metrics:deliveries")
    seeded = await seed(run, args.connections, args.passengers)

    # Every inbound flight is delayed 25 minutes, all at once.
    producer = await kafka_producer()
    event_ids, started = {}, time.time()
    async with session() as db:
        for flight_id, _ in seeded:
            flight = await db.get(FlightInstance, flight_id)
            apply(flight, {"est_arr": flight.sched_arr + timedelta(minutes=25)}, "manual")
        await db.commit()
        for flight_id, _ in seeded:
            flight = await db.get(FlightInstance, flight_id)
            event_id = uid()
            event_ids[event_id] = time.time()
            await publish_update(producer, flight, event_id)
    published = time.time()
    await producer.stop()

    # Wait until every event is committed and its outbox rows are delivered.
    events: dict[str, dict] = {}
    deadline = time.time() + args.timeout
    while time.time() < deadline:
        for raw in await client.lrange("metrics:events", 0, -1):
            entry = json.loads(raw)
            if entry["event_id"] in event_ids:
                events[entry["event_id"]] = entry
        async with session() as db:
            pending = (await db.execute(select(func.count(Outbox.id)).where(Outbox.sent_at.is_(None)))).scalar_one()
        delivered = await client.llen("metrics:deliveries")
        if len(events) == len(event_ids) and pending == 0:
            await asyncio.sleep(1.5)  # let the last consumer acknowledgements land
            if await client.llen("metrics:deliveries") == delivered:
                break
        await asyncio.sleep(0.5)

    deliveries: dict[str, list[float]] = {}
    for raw in await client.lrange("metrics:deliveries", 0, -1):
        entry = json.loads(raw)
        if entry.get("event_id") in event_ids:
            deliveries.setdefault(entry["event_id"], []).append(entry["at"])
    committed = [e["committed_at"] for e in events.values()]
    last_delivery = max((max(times) for times in deliveries.values()), default=None)
    engine_wall = (max(committed) - started) if committed else None
    total_wall = (last_delivery - started) if last_delivery else None
    passengers = sum(e["passengers"] for e in events.values())
    decisions = sum(e["decisions"] for e in events.values())
    model_calls = sum(e["model_calls"] for e in events.values())
    result = {
        "label": args.label, "model": "fake (instant, policy-based)" if get_settings().model_fake else "real clef-flash",
        "connections": args.connections, "passengers_per_connection": args.passengers, "passengers": passengers,
        "events_published": len(event_ids), "events_processed": len(events), "complete": len(events) == len(event_ids),
        "publish_seconds": round(published - started, 2),
        "engine_seconds": round(engine_wall, 2) if engine_wall else None,
        "end_to_end_seconds": round(total_wall, 2) if total_wall else None,
        "events_per_second": round(len(events) / engine_wall, 1) if engine_wall else None,
        "passengers_per_second": round(passengers / engine_wall, 1) if engine_wall else None,
        "decisions": decisions, "messages_delivered": sum(len(v) for v in deliveries.values()),
        "model_calls": model_calls, "model_calls_if_scored_per_passenger": passengers * 2 + len(events),
        "risk_calls": len(events) - sum(e["cache_hits"] for e in events.values()),
        "processing_ms_per_event": summary([(e["committed_at"] - e["received_at"]) * 1000 for e in events.values()]),
        "event_to_commit_ms": summary([(e["committed_at"] - event_ids[i]) * 1000 for i, e in events.items()]),
        "event_to_last_delivery_ms": summary([(max(times) - event_ids[i]) * 1000 for i, times in deliveries.items()]),
    }
    print("BENCH_RESULT " + json.dumps(result), flush=True)
    await cleanup()


if __name__ == "__main__":
    asyncio.run(main())
