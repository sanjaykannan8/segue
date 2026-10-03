"""Connections to Redis, Redpanda and RabbitMQ, and the names everything agrees on."""
import json

import aio_pika
from aiokafka import AIOKafkaProducer
from redis.asyncio import Redis

from .settings import get_settings

TOPIC_ITINERARY = "itinerary.events"
TOPIC_FLIGHT = "flight.events"
TOPIC_DLQ = "engine.dlq"

EXCHANGE = "segue.actions"   # topic exchange: one routing key per audience
EXCHANGE_DLQ = "segue.dlq"
# routing key -> queue
QUEUES = {
    "ops.action": "q.ops",
    "crew.deplane": "q.crew",
    "ground.dispatch": "q.ground",
    "authority.fasttrack": "q.authority",
    "pax.alert": "q.pax",
}
AUDIENCE = {"q.ops": "ops", "q.crew": "crew", "q.ground": "ground", "q.authority": "authority", "q.pax": "pax"}
RETRY_DELAYS_MS = (5_000, 30_000, 120_000)  # three attempts, increasing delays, then the dead-letter queue

_redis: Redis | None = None


def redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


async def kafka_producer() -> AIOKafkaProducer:
    producer = AIOKafkaProducer(
        bootstrap_servers=get_settings().kafka_brokers,
        value_serializer=lambda v: json.dumps(v).encode(),
        key_serializer=lambda k: k.encode() if k else None,
        enable_idempotence=True,
    )
    await producer.start()
    return producer


async def notify(audience: str, event: str = "refresh", data: dict | None = None, principal_id: str | None = None) -> None:
    """Live push to open screens through Redis pub/sub. Carries no personal data beyond the feed item itself."""
    channel = f"live:pax:{principal_id}" if principal_id else f"live:{audience}"
    await redis().publish(channel, json.dumps({"event": event, "data": data or {}}))


async def rabbit_connect() -> aio_pika.abc.AbstractRobustConnection:
    return await aio_pika.connect_robust(get_settings().rabbit_url)


async def declare_topology(channel: aio_pika.abc.AbstractChannel) -> dict[str, aio_pika.abc.AbstractQueue]:
    """The exchange, one queue per audience, and for each queue three delay queues (retries) and a dead-letter queue."""
    actions = await channel.declare_exchange(EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
    dlq = await channel.declare_exchange(EXCHANGE_DLQ, aio_pika.ExchangeType.DIRECT, durable=True)
    queues = {}
    for routing_key, name in QUEUES.items():
        arguments = {"x-max-priority": 10} if name == "q.ground" else {}
        queue = await channel.declare_queue(name, durable=True, arguments=arguments)
        await queue.bind(actions, routing_key)
        dead = await channel.declare_queue(f"{name}.dlq", durable=True)
        await dead.bind(dlq, name)
        for delay in RETRY_DELAYS_MS:
            # A failed message waits here for its delay, then dead-letters back to the main exchange under its routing key.
            await channel.declare_queue(retry_queue(name, delay), durable=True, arguments={"x-message-ttl": delay, "x-dead-letter-exchange": EXCHANGE, "x-dead-letter-routing-key": routing_key})
        queues[name] = queue
    return queues


def retry_queue(name: str, delay_ms: int) -> str:
    return f"{name}.retry.{delay_ms}"
