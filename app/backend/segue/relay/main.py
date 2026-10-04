"""Outbox relay. Reads unsent outbox rows, publishes each to RabbitMQ with publisher confirms,
then marks it sent. If it crashes between publish and mark, the row is published again and the
consumer's inbox table drops the duplicate by message id."""
import asyncio
import json
import logging

import aio_pika
from sqlalchemy import select

from ..core.breaker import Breaker, BreakerOpen
from ..core.bus import EXCHANGE, declare_topology, rabbit_connect, redis
from ..core.db import Outbox, now, session
from ..core.trace import trace

log = logging.getLogger("segue.relay")


BATCH = 200


async def publish_batch(exchange: aio_pika.abc.AbstractExchange) -> int:
    """Publish a batch of unsent rows. The broker's confirms for the whole batch are awaited together,
    and a row is marked sent only if its own confirm arrived: a failure leaves it for the next pass.
    `skip_locked` lets several relay instances share the table without sending a row twice."""
    async with session() as db:
        rows = list((await db.execute(select(Outbox).where(Outbox.sent_at.is_(None)).order_by(Outbox.id).limit(BATCH).with_for_update(skip_locked=True))).scalars())
        sending = []
        for row in rows:
            expiration = None
            if row.expires_at:
                remaining = (row.expires_at - now()).total_seconds()
                if remaining <= 0:
                    row.sent_at = now()  # too late to be useful (the flight has gone): drop it
                    continue
                expiration = remaining
            message = aio_pika.Message(
                body=json.dumps(row.payload).encode(),
                message_id=row.message_id, delivery_mode=aio_pika.DeliveryMode.PERSISTENT, content_type="application/json",
                priority=row.priority or None, expiration=expiration, headers={"x-attempt": 0},
            )
            sending.append((row, exchange.publish(message, routing_key=row.routing_key)))
        confirms = await asyncio.gather(*(publish for _, publish in sending), return_exceptions=True)
        failed = None
        for (row, _), confirm in zip(sending, confirms):
            if isinstance(confirm, Exception):
                failed = confirm
                continue
            row.sent_at = now()
            await trace(row.payload.get("event_id"), "publish", f"Outbox → RabbitMQ: {row.routing_key}", routing_key=row.routing_key, wait_ms=round((now() - row.created_at).total_seconds() * 1000))
        await db.commit()
        if failed is not None:
            raise failed  # counted by the circuit breaker; the unconfirmed rows are still unsent
        return len(rows)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    connection = await rabbit_connect()
    channel = await connection.channel(publisher_confirms=True)
    await declare_topology(channel)
    exchange = await channel.get_exchange(EXCHANGE)
    breaker = Breaker(redis(), "rabbit")
    log.info("relay running")
    while True:
        try:
            sent = await breaker.call(lambda: publish_batch(exchange))
        except BreakerOpen:
            sent = 0
            await asyncio.sleep(2)
        except Exception as error:
            log.warning("relay publish failed: %s", type(error).__name__)
            sent = 0
            await asyncio.sleep(1)
        if sent == 0:
            await asyncio.sleep(0.4)


if __name__ == "__main__":
    asyncio.run(main())
