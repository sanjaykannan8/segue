"""Redpanda consumer. Offsets are committed only after the decision transaction commits,
so a crash replays the event and the idempotency keys make the replay harmless."""
import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from sqlalchemy import or_, select

from ..core.bus import TOPIC_DLQ, TOPIC_FLIGHT, TOPIC_ITINERARY, kafka_producer, notify
from ..core.db import Connection, DeadEvent, session
from ..core.settings import get_settings
from ..core.trace import trace
from .core import process_connection

log = logging.getLogger("segue.engine")
ATTEMPTS = 3


async def handle(event: dict) -> None:
    kind, event_id = event["type"], event["event_id"]
    await trace(event_id, "event", {"itinerary.created": "A passenger added a trip", "flight.updated": "A flight changed", "itinerary.withdrawn": "A passenger left"}.get(kind, kind), type=kind, topic="itinerary.events" if kind.startswith("itinerary") else "flight.events")
    async with session() as db:
        if kind == "itinerary.created":
            targets, only = [event["connection_id"]], event.get("itinerary_id")
        elif kind == "flight.updated":
            flight_id = event["flight_id"]
            targets = list((await db.execute(select(Connection.id).where(or_(Connection.inbound_id == flight_id, Connection.outbound_id == flight_id)))).scalars())
            only = None
        elif kind == "itinerary.withdrawn":
            await notify("ops")
            return
        else:
            raise ValueError(f"unknown event type {kind!r}")
        principals: set[str] = set()
        for connection_id in targets:
            result = await process_connection(db, connection_id, event_id, only)
            principals |= result.principals
        await db.commit()  # decisions and outbox rows land together
    await notify("ops")
    for principal_id in principals:
        await notify("pax", "connection", principal_id=principal_id)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    consumer = AIOKafkaConsumer(TOPIC_ITINERARY, TOPIC_FLIGHT, bootstrap_servers=get_settings().kafka_brokers, group_id="segue-engine", enable_auto_commit=False, auto_offset_reset="earliest")
    producer = await kafka_producer()
    await consumer.start()
    log.info("engine consuming")
    try:
        async for message in consumer:
            raw = message.value
            error = None
            for attempt in range(ATTEMPTS):
                try:
                    await handle(json.loads(raw))
                    error = None
                    break
                except Exception as exc:  # retry with a short backoff, then dead-letter
                    error = exc
                    log.warning("event failed (attempt %d): %r", attempt + 1, exc)
                    await asyncio.sleep(0.5 * (attempt + 1))
            if error is not None:
                try:
                    payload = json.loads(raw)
                except Exception:
                    payload = {"raw": raw.decode(errors="replace")}
                async with session() as db:
                    db.add(DeadEvent(topic=message.topic, key=message.key.decode() if message.key else None, payload=payload, error=repr(error)))
                    await db.commit()
                await producer.send_and_wait(TOPIC_DLQ, key=message.key.decode() if message.key else None, value={"topic": message.topic, "payload": payload, "error": repr(error)})
            await consumer.commit()  # the partition keeps moving either way
    finally:
        await consumer.stop()
        await producer.stop()


if __name__ == "__main__":
    asyncio.run(main())
