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

log = logging.getLogger("segue.relay")


async def publish_batch(exchange: aio_pika.abc.AbstractExchange) -> int:
    async with session() as db:
        rows = list((await db.execute(select(Outbox).where(Outbox.sent_at.is_(None)).order_by(Outbox.id).limit(50).with_for_update(skip_locked=True))).scalars())
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
            await exchange.publish(message, routing_key=row.routing_key)  # confirmed by the broker before we mark it
            row.sent_at = now()
        await db.commit()
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
            log.warning("relay publish failed: %r", error)
            sent = 0
            await asyncio.sleep(1)
        if sent == 0:
            await asyncio.sleep(0.4)


if __name__ == "__main__":
    asyncio.run(main())
