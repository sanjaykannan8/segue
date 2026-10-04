"""One consumer per audience queue. Each message is delivered to its audience's feed exactly once:
the inbox table drops redeliveries, failures retry with increasing delays, and after three
attempts the message goes to that queue's dead-letter queue."""
import asyncio
import hashlib
import json
import logging
import time

import aio_pika
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from ..core.bus import AUDIENCE, EXCHANGE_DLQ, RETRY_DELAYS_MS, declare_topology, metric, notify, rabbit_connect, redis, retry_queue
from ..core.db import FeedItem, Itinerary, PassengerPII, ProcessedMessage, session
from ..core.settings import get_settings
from ..privacy.service import active_consents
from ..core.trace import trace
from ..core.util import decrypt
from . import mailer
from .templates import render

log = logging.getLogger("segue.consumers")


NEEDS = {"pax": "notifications", "authority": "authority_share", "crew": "tracking", "ground": "tracking"}


async def _still_allowed(db, audience: str, payload: dict) -> bool:
    principal_id = payload.get("principal_id")
    if not principal_id and payload.get("itinerary_id"):
        itinerary = await db.get(Itinerary, payload["itinerary_id"])
        principal_id = itinerary.principal_id if itinerary else None
    return bool(principal_id) and NEEDS[audience] in await active_consents(db, principal_id)


async def deliver(queue_name: str, message_id: str, payload: dict) -> None:
    audience = AUDIENCE[queue_name]
    async with session() as db:
        db.add(ProcessedMessage(consumer=queue_name, message_id=message_id))
        try:
            await db.flush()
        except IntegrityError:
            return  # already delivered: a duplicate from the relay or a redelivery
        principal_id = payload.get("principal_id") if audience == "pax" else None
        email = None
        # Consent is checked again here, at the last step: it may have been withdrawn, or the person
        # erased, while the message sat in the outbox or a queue.
        if audience != "ops" and not payload.get("retract") and not await _still_allowed(db, audience, payload):
            await db.commit()  # recorded as handled, so a redelivery is dropped too
            return
        if audience == "pax":
            pii = await db.get(PassengerPII, principal_id)
            title, body = render(payload["template"], pii.language if pii else "en", payload.get("vars", {}))
            item = FeedItem(audience="pax", principal_id=principal_id, connection_id=payload.get("connection_id"), decision_id=payload.get("decision_id"), payload={"template": payload["template"], "title": title, "body": body, "level": payload.get("level")})
            db.add(item)
            email = (decrypt(pii.email_enc), pii.language, title, body) if pii and pii.email_enc else None
            if email and await redis().get(f"emailok:{principal_id}") != mailer.address_mark(email[0]):
                email = None  # the address has not been confirmed by its owner: the in-app message is the only copy
        elif audience != "ops":
            # One live row per passenger per audience: a newer decision replaces the older one.
            if payload.get("itinerary_id"):
                stale = (await db.execute(select(FeedItem).where(FeedItem.audience == audience, FeedItem.status == "open", FeedItem.connection_id == payload.get("connection_id")))).scalars()
                for row in stale:
                    if row.payload.get("itinerary_id") == payload["itinerary_id"]:
                        await db.execute(delete(FeedItem).where(FeedItem.id == row.id))
            if payload.get("retract"):
                item = None  # the instruction was withdrawn: the stale row above is gone and nothing replaces it
            else:
                item = FeedItem(audience=audience, principal_id=payload.get("principal_id"), connection_id=payload.get("connection_id"), decision_id=payload.get("decision_id"), payload=payload)
                db.add(item)
        else:
            item = None  # the ops dashboard reads decisions directly; this message only triggers a refresh
        await db.commit()
    await metric("deliveries", {"event_id": payload.get("event_id"), "audience": audience, "at": time.time()})
    WHO = {"pax": "the passenger", "ops": "the ops dashboard", "crew": "the cabin crew list", "ground": "the dispatch queue", "authority": "the airport authority list"}
    await trace(payload.get("event_id"), "deliver", f"Delivered to {WHO[audience]}", audience=audience, queue=queue_name, seat=payload.get("seat"), template=payload.get("template"))
    if email:
        # After the commit, and best-effort: a mail outage never blocks or loses the in-app message.
        sent = await mailer.mail_allowed(email[0]) and await mailer.send(email[0], email[1], email[2], email[3], payload.get("vars", {}))
        await trace(payload.get("event_id"), "deliver", "Emailed to the passenger, with the route map" if sent else "Email not sent (mail is unavailable or the hourly limit for this address is reached); the in-app message stands", audience="pax", queue="email", seat=payload.get("seat"), template=payload.get("template"))
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
                log.warning("%s delivery failed (attempt %d): %s", queue.name, attempt + 1, type(error).__name__)
                copy = aio_pika.Message(body=message.body, message_id=message.message_id, delivery_mode=aio_pika.DeliveryMode.PERSISTENT, content_type=message.content_type, priority=message.priority, headers={"x-attempt": attempt + 1, "x-error": type(error).__name__})
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
