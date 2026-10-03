"""One consumer per audience queue. Each message is delivered to its audience's feed exactly once:
the inbox table drops redeliveries, failures retry with increasing delays, and after three
attempts the message goes to that queue's dead-letter queue."""
import asyncio
import json
import logging

import aio_pika
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from ..core.bus import AUDIENCE, EXCHANGE_DLQ, RETRY_DELAYS_MS, declare_topology, notify, rabbit_connect, retry_queue
from ..core.db import FeedItem, PassengerPII, ProcessedMessage, session
from .templates import render

log = logging.getLogger("segue.consumers")


async def deliver(queue_name: str, message_id: str, payload: dict) -> None:
    audience = AUDIENCE[queue_name]
    async with session() as db:
        db.add(ProcessedMessage(consumer=queue_name, message_id=message_id))
        try:
            await db.flush()
        except IntegrityError:
            return  # already delivered: a duplicate from the relay or a redelivery
        principal_id = payload.get("principal_id") if audience == "pax" else None
        if audience == "pax":
            pii = await db.get(PassengerPII, principal_id)
            title, body = render(payload["template"], pii.language if pii else "en", payload.get("vars", {}))
            item = FeedItem(audience="pax", principal_id=principal_id, connection_id=payload.get("connection_id"), decision_id=payload.get("decision_id"), payload={"template": payload["template"], "title": title, "body": body, "level": payload.get("level")})
            db.add(item)
        elif audience != "ops":
            # One live row per passenger per audience: a newer decision replaces the older one.
            if payload.get("itinerary_id"):
                stale = (await db.execute(select(FeedItem).where(FeedItem.audience == audience, FeedItem.status == "open"))).scalars()
                for row in stale:
                    if row.payload.get("itinerary_id") == payload["itinerary_id"]:
                        await db.execute(delete(FeedItem).where(FeedItem.id == row.id))
            item = FeedItem(audience=audience, principal_id=payload.get("principal_id"), connection_id=payload.get("connection_id"), decision_id=payload.get("decision_id"), payload=payload)
            db.add(item)
        else:
            item = None  # the ops dashboard reads decisions directly; this message only triggers a refresh
        await db.commit()
    if audience == "pax" and item is not None:
        await notify("pax", "feed", {"id": item.id, **item.payload, "created_at": item.created_at.isoformat()}, principal_id=principal_id)
    else:
        await notify(audience)


async def consume(channel: aio_pika.abc.AbstractChannel, queue: aio_pika.abc.AbstractQueue) -> None:
    dlq = await channel.get_exchange(EXCHANGE_DLQ)
    async with queue.iterator() as messages:
        async for message in messages:
            attempt = int((message.headers or {}).get("x-attempt", 0))
            try:
                await deliver(queue.name, message.message_id or message.delivery_tag.__str__(), json.loads(message.body))
            except Exception as error:
                log.warning("%s delivery failed (attempt %d): %r", queue.name, attempt + 1, error)
                copy = aio_pika.Message(body=message.body, message_id=message.message_id, delivery_mode=aio_pika.DeliveryMode.PERSISTENT, content_type=message.content_type, priority=message.priority, headers={"x-attempt": attempt + 1, "x-error": repr(error)[:200]})
                if attempt < len(RETRY_DELAYS_MS):
                    await channel.default_exchange.publish(copy, routing_key=retry_queue(queue.name, RETRY_DELAYS_MS[attempt]))
                else:
                    await dlq.publish(copy, routing_key=queue.name)
            await message.ack()


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    connection = await rabbit_connect()
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=10)
    queues = await declare_topology(channel)
    log.info("consumers running")
    await asyncio.gather(*(consume(channel, queue) for queue in queues.values()))


if __name__ == "__main__":
    asyncio.run(main())
