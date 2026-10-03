"""Control panel: health, breakers, event injection, dead letters, audit. Role `admin` only."""
import asyncio
import json
from datetime import timedelta, timezone
from typing import Literal

import aio_pika
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.breaker import NAMES, Breaker
from ..core.bus import AUDIENCE, EXCHANGE, QUEUES, TOPIC_FLIGHT, declare_topology, rabbit_connect, redis
from ..core.db import AuditLog, Connection, ConnectionRisk, DeadEvent, FlightInstance, Outbox, uid
from ..core.settings import get_settings
from ..flights import service as flights
from ..flights.provider import budget
from ..model import client as model
from ..privacy.service import audit
from .deps import get_db, staff

router = APIRouter(prefix="/admin")
admin = staff("admin")


class EventIn(BaseModel):
    flight_id: str
    delay_min: int | None = None
    dep_gate: str | None = None
    arr_gate: str | None = None
    dep_terminal: str | None = None
    arr_terminal: str | None = None
    status: str | None = None


class BreakerIn(BaseModel):
    state: Literal["open", "closed", "auto"]


class ReplayIn(BaseModel):
    kind: Literal["event", "queue"]
    id: str | None = None
    name: str | None = None


async def _check(name: str, probe) -> tuple[str, dict]:
    try:
        detail = await asyncio.wait_for(probe(), timeout=4)
        return name, {"ok": True, "detail": detail or "ok"}
    except Exception as error:
        return name, {"ok": False, "detail": type(error).__name__ + (f": {error}" if str(error) else "")}


async def _model_health() -> str:
    """The model answers one tiny question. Cached briefly so the console's polling does not load it."""
    cached = await redis().get("health:model")
    if cached:
        result = json.loads(cached)
        if not result["ok"]:
            raise RuntimeError(result["detail"])
        return result["detail"]
    try:
        name = await model.ping()
        await redis().set("health:model", json.dumps({"ok": True, "detail": name}), ex=15)
        return name
    except Exception as error:
        await redis().set("health:model", json.dumps({"ok": False, "detail": type(error).__name__}), ex=15)
        raise


@router.get("/health")
async def health(request: Request, user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    async def postgres():
        await db.execute(text("select 1"))

    async def redpanda():
        await request.app.state.producer.client.fetch_all_metadata()

    async def rabbit():
        connection = await aio_pika.connect(get_settings().rabbit_url, timeout=3)
        await connection.close()

    async def airlabs():
        if not get_settings().airlabs_api_key:
            raise RuntimeError("no API key set")
        b = await budget()
        if b["used"] >= b["budget"]:
            raise RuntimeError("query budget spent")
        return f"{b['used']} of {b['budget']} queries used"

    checks = await asyncio.gather(_check("postgres", postgres), _check("redis", redis().ping), _check("redpanda", redpanda), _check("rabbitmq", rabbit), _check("model", _model_health), _check("airlabs", airlabs))
    for name, value in checks:
        if value["detail"] is True:
            value["detail"] = "ok"
    return {
        "services": dict(checks),
        "breakers": [await Breaker(redis(), name).snapshot() for name in NAMES],
        "airlabs": await budget(),
        "outbox_pending": (await db.execute(select(func.count(Outbox.id)).where(Outbox.sent_at.is_(None)))).scalar_one(),
        "dead_events": (await db.execute(select(func.count(DeadEvent.id)))).scalar_one(),
    }


@router.get("/flights")
async def tracked(user: dict = admin, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(FlightInstance).order_by(FlightInstance.sched_dep))).scalars()
    return [flights.view(f) for f in rows]


@router.post("/events")
async def inject(body: EventIn, request: Request, user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    """Change a flight by hand (a delay, a gate) and publish the event, exactly as the poller would."""
    flight = await db.get(FlightInstance, body.flight_id)
    if flight is None:
        raise HTTPException(404, "No such flight.")
    fields = body.model_dump(exclude={"flight_id", "delay_min"}, exclude_none=True)
    if body.delay_min is not None:
        aware = lambda v: v.replace(tzinfo=timezone.utc) if v and v.tzinfo is None else v
        if flight.sched_arr:
            fields["est_arr"] = aware(flight.sched_arr) + timedelta(minutes=body.delay_min)
        if flight.sched_dep:
            fields["est_dep"] = aware(flight.sched_dep) + timedelta(minutes=body.delay_min)
    changed = flights.apply(flight, fields, "manual")
    await audit(db, user["email"], user["role"], "event:inject", f"{flight.flight_iata} {json.dumps(body.model_dump(exclude={'flight_id'}, exclude_none=True))}")
    await db.commit()
    if changed:
        await flights.publish_update(request.app.state.producer, flight)
    return flights.view(flight)


@router.post("/breaker/{name}")
async def set_breaker(name: str, body: BreakerIn, request: Request, user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    if name not in NAMES:
        raise HTTPException(404, "No such breaker.")
    breaker = Breaker(redis(), name)
    await breaker.force(body.state)
    await redis().delete("health:model")
    await audit(db, user["email"], user["role"], "breaker", f"{name}={body.state}")
    await db.commit()
    if name == "model" and body.state != "open":
        # The model is back: re-score every connection that is currently on fixed rules.
        rows = (await db.execute(select(Connection).join(ConnectionRisk, ConnectionRisk.connection_id == Connection.id).where(ConnectionRisk.source == "rules").distinct())).scalars()
        for connection in rows:
            inbound = await db.get(FlightInstance, connection.inbound_id)
            await request.app.state.producer.send_and_wait(TOPIC_FLIGHT, key=inbound.id, value={"type": "flight.updated", "event_id": uid(), "flight_id": inbound.id, "version": inbound.version})
    return await breaker.snapshot()


@router.get("/dlq")
async def dead_letters(user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    events = (await db.execute(select(DeadEvent).order_by(DeadEvent.created_at.desc()).limit(100))).scalars()
    queues = []
    try:
        connection = await rabbit_connect()
        async with connection:
            channel = await connection.channel()
            for name in QUEUES.values():
                queue = await channel.declare_queue(f"{name}.dlq", durable=True, passive=True)
                queues.append({"name": f"{name}.dlq", "messages": queue.declaration_result.message_count})
    except Exception:
        queues = [{"name": f"{name}.dlq", "messages": -1} for name in QUEUES.values()]
    return {"events": [{"id": e.id, "topic": e.topic, "error": e.error, "payload": e.payload, "created_at": e.created_at.isoformat()} for e in events], "queues": queues}


@router.post("/dlq/replay")
async def replay(body: ReplayIn, request: Request, user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    replayed = 0
    if body.kind == "event":
        event = await db.get(DeadEvent, body.id or "")
        if event is None:
            raise HTTPException(404, "No such dead event.")
        await request.app.state.producer.send_and_wait(event.topic, key=event.key, value=event.payload)
        await db.delete(event)
        replayed = 1
    else:
        source = (body.name or "").removesuffix(".dlq")
        if source not in AUDIENCE:
            raise HTTPException(404, "No such queue.")
        routing_key = next(key for key, queue in QUEUES.items() if queue == source)
        connection = await rabbit_connect()
        async with connection:
            channel = await connection.channel(publisher_confirms=True)
            await declare_topology(channel)
            exchange = await channel.get_exchange(EXCHANGE)
            dead = await channel.get_queue(f"{source}.dlq")
            while True:
                message = await dead.get(fail=False)
                if message is None:
                    break
                await exchange.publish(aio_pika.Message(body=message.body, message_id=message.message_id, delivery_mode=aio_pika.DeliveryMode.PERSISTENT, content_type=message.content_type, headers={"x-attempt": 0}), routing_key=routing_key)
                await message.ack()
                replayed += 1
    await audit(db, user["email"], user["role"], "dlq:replay", f"{body.kind}:{body.id or body.name} ({replayed})")
    await db.commit()
    return {"replayed": replayed}


@router.get("/audit")
async def audit_log(limit: int = 100, user: dict = admin, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 500)))).scalars()
    return [{"at": r.at.isoformat(), "actor": r.actor, "role": r.role, "action": r.action, "object": r.object} for r in rows]
