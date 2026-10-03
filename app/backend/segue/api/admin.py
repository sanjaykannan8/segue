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
from ..core import buffer as buf
from ..core import trace as tracing
from ..core.bus import TOPIC_ITINERARY
from ..core.db import Decision, FeedItem, AssistanceNeed, AuditLog, Connection, ConnectionRisk, Consent, DataPrincipal, DeadEvent, FlightInstance, Itinerary, Outbox, PassengerPII, now, uid
from ..core.util import decrypt, encrypt
from ..privacy.service import erase_principal
from ..core.settings import get_settings
from ..flights import service as flights
from ..flights.provider import budget
from ..model import client as model
from ..privacy.service import audit
from .deps import get_db, sse, staff

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


# ---- Demo: a scripted scenario on made-up passengers, and the trace of what the system does with it ----
DEMO_SET, DEMO_STATE = "demo:principals", "demo:state"
# seat, booking, declared assistance, extra consents
DEMO_PASSENGERS = [
    ("9C", "single_ticket", None, ("authority_share",)),
    ("12A", "single_ticket", None, ("authority_share",)),
    ("14C", "single_ticket", "wheelchair", ("assistance",)),
    ("18E", "single_ticket", None, ()),
    ("31F", "single_ticket", None, ()),
    ("33B", "single_ticket", None, ()),
    ("22D", "separate_tickets", None, ()),
    ("45K", "separate_tickets", None, ()),
]


async def _demo_state(db: AsyncSession) -> dict | None:
    raw = await redis().get(DEMO_STATE)
    if not raw:
        return None
    state = json.loads(raw)
    inbound, outbound = await db.get(FlightInstance, state["inbound_id"]), await db.get(FlightInstance, state["outbound_id"])
    if inbound is None or outbound is None:
        return None
    risk = await db.get(ConnectionRisk, (state["connection_id"], f"{inbound.version}.{outbound.version}"))
    if risk is None:
        # A new flight version is being scored right now: show the last saved risk until it lands.
        risk = (await db.execute(select(ConnectionRisk).where(ConnectionRisk.connection_id == state["connection_id"]).order_by(ConnectionRisk.computed_at.desc()).limit(1))).scalar_one_or_none()
    passengers = (await db.execute(select(func.count(Itinerary.id)).where(Itinerary.connection_id == state["connection_id"]))).scalar_one()
    return {
        "connection_id": state["connection_id"], "inbound": flights.view(inbound), "outbound": flights.view(outbound), "passengers": passengers,
        "risk": {"level": risk.level, "buffer_min": risk.buffer_min, "left_min": risk.left_min, "needed_min": risk.needed_min, "source": risk.source, "confidence": risk.confidence} if risk else None,
    }


@router.get("/demo")
async def demo_state(user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    return {"demo": await _demo_state(db)}


@router.post("/demo/run")
async def demo_run(request: Request, user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    """Seed one connection with eight made-up passengers. No real person's data is involved."""
    if await redis().get(DEMO_STATE):
        raise HTTPException(409, "A demo is already running. Reset it first.")
    tag = uid()[:3].upper()
    arrival = now().replace(second=0, microsecond=0) + timedelta(hours=2)
    inbound, _ = await flights.upsert(db, {"flight_iata": f"SG{tag}1", "date": arrival.strftime("%Y-%m-%d"), "origin": "DEL", "dest": "DXB", "sched_dep": arrival - timedelta(hours=3), "est_dep": arrival - timedelta(hours=3), "sched_arr": arrival, "est_arr": arrival, "arr_terminal": "3", "arr_gate": "C22", "status": "en-route"}, "manual")
    departure = arrival + timedelta(minutes=75)
    outbound, _ = await flights.upsert(db, {"flight_iata": f"SG{tag}2", "date": departure.strftime("%Y-%m-%d"), "origin": "DXB", "dest": "LHR", "sched_dep": departure, "est_dep": departure, "sched_arr": departure + timedelta(hours=7), "est_arr": departure + timedelta(hours=7), "dep_terminal": "3", "dep_gate": "B14", "status": "scheduled"}, "manual")
    await db.flush()
    connection = Connection(id=uid(), inbound_id=inbound.id, outbound_id=outbound.id, airport="DXB")
    db.add(connection)
    await db.flush()
    created = []
    for index, (seat, booking, assistance, extra) in enumerate(DEMO_PASSENGERS, start=1):
        principal = DataPrincipal(id=uid())
        db.add(principal)
        await db.flush()
        db.add(PassengerPII(principal_id=principal.id, name_enc=encrypt(f"Demo passenger {index}"), language="en"))
        for purpose in ("tracking", "notifications", *extra):
            db.add(Consent(principal_id=principal.id, purpose=purpose, notice_version=get_settings().notice_version))
        itinerary = Itinerary(id=uid(), principal_id=principal.id, connection_id=connection.id, seat=seat, booking=booking, expires_at=departure + timedelta(hours=get_settings().retention_hours))
        db.add(itinerary)
        await db.flush()
        if assistance:
            db.add(AssistanceNeed(itinerary_id=itinerary.id, type_enc=encrypt(assistance)))
        created.append((principal.id, itinerary.id))
    await audit(db, user["email"], user["role"], "demo:run", f"{inbound.flight_iata} → {outbound.flight_iata}, {len(created)} made-up passengers")
    await db.commit()
    await redis().sadd(DEMO_SET, *[principal_id for principal_id, _ in created])
    await redis().set(DEMO_STATE, json.dumps({"connection_id": connection.id, "inbound_id": inbound.id, "outbound_id": outbound.id}))
    await tracing.clear()
    for _, itinerary_id in created:
        await request.app.state.producer.send_and_wait(TOPIC_ITINERARY, key=inbound.id, value={"type": "itinerary.created", "event_id": uid(), "itinerary_id": itinerary_id, "connection_id": connection.id})
    return {"demo": await _demo_state(db)}


@router.post("/demo/reset")
async def demo_reset(user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    """Erase the made-up passengers, clear the trace and return the model breaker to automatic."""
    erased = 0
    for principal_id in await redis().smembers(DEMO_SET):
        if await db.get(DataPrincipal, principal_id):
            await erase_principal(db, principal_id, actor="retention", reason="demo reset")
            erased += 1
    await audit(db, user["email"], user["role"], "demo:reset", f"{erased} made-up passengers erased")
    await db.commit()
    await redis().delete(DEMO_SET, DEMO_STATE, "health:model")
    await Breaker(redis(), "model").force("auto")
    await tracing.clear()
    return {"erased": erased}


@router.get("/trace")
async def trace_log(limit: int = 300, user: dict = admin) -> list[dict]:
    return await tracing.recent(limit)


@router.get("/trace/stream")
async def trace_stream(user: dict = admin):
    return sse(tracing.CHANNEL)


LEVEL_WORD = {"safe": "Safe", "tight": "Tight", "at_risk": "At Risk", "lost": "Lost"}
SEVERITY = {"safe": 0, "tight": 1, "at_risk": 2, "lost": 3}
AUDIENCE_OF = {"crew_priority_deplane": "crew", "ground_dispatch": "ground", "request_fast_track": "authority"}


def _staff_line(decision: Decision, seat: str) -> dict:
    """One plain sentence about what a staff group was told (or is waiting to be told) about a passenger."""
    kind = decision.answer.replace("_", " ")
    text = {
        "crew_priority_deplane": f"Cabin crew: call seat {seat} off the aircraft first",
        "ground_dispatch": f"Ground staff: send a {kind} for seat {seat}",
        "request_fast_track": "Airport: fast-track lane requested",
    }[decision.type]
    state = {"executed": "sent", "approved": "sent", "pending": "waiting", "dismissed": "dismissed", "expired": "expired"}[decision.status]
    note = {"sent": "Sent", "waiting": "Waiting for ops to approve" if decision.gate == "approval" else "Waiting for a person: the model was not sure", "dismissed": "Dismissed by ops", "expired": "Expired"}[state]
    return {"audience": AUDIENCE_OF[decision.type], "text": text, "state": state, "note": note, "decision_id": decision.id if state == "waiting" else None, "confidence": round(decision.confidence, 2)}


@router.get("/demo/board")
async def demo_board(user: dict = admin, db: AsyncSession = Depends(get_db)) -> dict:
    """The demo as a person would describe it: what just happened, then each passenger and what they and the staff were told."""
    raw = await redis().get(DEMO_STATE)
    if not raw:
        return {"story": [], "passengers": [], "ops": None}
    state = json.loads(raw)
    connection = await db.get(Connection, state["connection_id"])
    inbound, outbound = await db.get(FlightInstance, connection.inbound_id), await db.get(FlightInstance, connection.outbound_id)
    aware = lambda v: v.replace(tzinfo=timezone.utc) if v and v.tzinfo is None else v
    arrival, departure = aware(inbound.est_arr or inbound.sched_arr), aware(outbound.est_dep or outbound.sched_dep)
    base = buf.connection_buffer(connection.airport, arrival, departure, inbound.arr_terminal, outbound.dep_terminal)
    risk = await db.get(ConnectionRisk, (connection.id, f"{inbound.version}.{outbound.version}"))
    if risk is None:
        risk = (await db.execute(select(ConnectionRisk).where(ConnectionRisk.connection_id == connection.id).order_by(ConnectionRisk.computed_at.desc()).limit(1))).scalar_one_or_none()
    level = risk.level if risk else None

    passengers = []
    itineraries = list((await db.execute(select(Itinerary).where(Itinerary.connection_id == connection.id))).scalars())
    itineraries.sort(key=lambda i: buf.seat_row(i.seat) or 0)
    for itinerary in itineraries:
        need = await db.get(AssistanceNeed, itinerary.id)
        assistance = decrypt(need.type_enc) if need else None
        offset = buf.passenger_offset(connection.airport, base, itinerary.seat, assistance, itinerary.booking)
        own = base.buffer_min - offset
        own_level = level
        if level and own < base.buffer_min:
            own_level = max(level, buf.rule_level(own), key=SEVERITY.get)
        # Why this passenger's buffer differs from the connection's, in words.
        config = buf.airport_config(connection.airport)
        reasons = []
        row = buf.seat_row(itinerary.seat)
        seat_part = round(((row or 20) - 20) * float(config["deplane_per_row_s"]) / 60)
        if seat_part:
            reasons.append(f"row {row} gets off {'later' if seat_part > 0 else 'earlier'} ({abs(seat_part)} min)")
        if assistance:
            reasons.append(f"{assistance.replace('_', ' ')} declared")
        if itinerary.booking == "separate_tickets":
            reasons.append(f"separate tickets: {int(config['self_transfer_extra_min'])} min to collect and re-check the bag")
        feed = list((await db.execute(select(FeedItem).where(FeedItem.principal_id == itinerary.principal_id, FeedItem.audience == "pax").order_by(FeedItem.created_at.desc()).limit(4))).scalars())
        staff_lines = []
        for decision_type in AUDIENCE_OF:
            latest = (await db.execute(select(Decision).where(Decision.itinerary_id == itinerary.id, Decision.type == decision_type).order_by(Decision.created_at.desc()).limit(1))).scalar_one_or_none()
            if latest is not None and latest.status != "expired" and latest.answer not in ("no", "none"):
                staff_lines.append(_staff_line(latest, itinerary.seat or "?"))
        passengers.append({
            "seat": itinerary.seat, "booking": itinerary.booking, "assistance": assistance,
            "level": own_level, "buffer_min": own, "why": reasons,
            "message": {"title": feed[0].payload.get("title"), "body": feed[0].payload.get("body"), "template": feed[0].payload.get("template"), "at": feed[0].created_at.isoformat()} if feed else None,
            "earlier_messages": [{"title": f.payload.get("title"), "at": f.created_at.isoformat()} for f in feed[1:]],
            "staff": staff_lines,
        })

    # The connection-level suggestion for ops.
    ops_decision = (await db.execute(select(Decision).where(Decision.connection_id == connection.id, Decision.type.in_(("ops_action", "review"))).order_by(Decision.created_at.desc()).limit(1))).scalar_one_or_none()
    ops = None
    if ops_decision is not None:
        payload = ops_decision.payload or {}
        ops = {"decision_id": ops_decision.id, "title": payload.get("title"), "detail": payload.get("detail"), "status": ops_decision.status, "gate": ops_decision.gate, "confidence": round(ops_decision.confidence, 2), "decided_by": ops_decision.decided_by}

    # What just happened, as a person would say it.
    delay = round((arrival - aware(inbound.sched_arr)).total_seconds() / 60) if inbound.sched_arr else 0
    protected = sum(1 for i in itineraries if i.booking != "separate_tickets")
    story = []
    story.append(f"{inbound.flight_iata} is landing {delay} minutes late." if delay > 0 else f"{inbound.flight_iata} is on time. {len(itineraries)} passengers on it connect to {outbound.flight_iata}.")
    story.append(f"After landing they have {base.left_min} minutes until the gate for {outbound.flight_iata} closes, and the transfer takes {base.needed_min}. That leaves a buffer of {base.buffer_min} minutes.")
    if risk is not None:
        how = "The model judged this from the time margin and the context, in one call, and the answer is shared by all passengers on the connection." if risk.source == "model" else "The model is unavailable, so this comes from fixed rules and nothing is automated."
        story.append(f"Segue rates the connection {LEVEL_WORD[risk.level]}. {how}")
    by_level: dict[str, int] = {}
    for p_ in passengers:
        if p_["level"]:
            by_level[p_["level"]] = by_level.get(p_["level"], 0) + 1
    if len(by_level) > 1:
        story.append("Passengers differ: " + ", ".join(f"{count} {LEVEL_WORD[name]}" for name, count in sorted(by_level.items(), key=lambda kv: SEVERITY[kv[0]])) + ". Seat row, a declared assistance need and separate tickets change each person's own buffer.")
    if ops is not None:
        ops_state = {"pending": "It is waiting for an ops controller to approve.", "approved": f"Ops approved it ({ops['decided_by']}).", "dismissed": "Ops dismissed it.", "executed": "It ran by itself."}.get(ops["status"], "")
        story.append(f"Suggested to ops: {ops['title']}. Only the {protected} passengers on one booking count toward it. {ops_state}")
    told = sum(1 for p_ in passengers if p_["message"])
    waiting = sum(1 for p_ in passengers for line in p_["staff"] if line["state"] == "waiting")
    sent = sum(1 for p_ in passengers for line in p_["staff"] if line["state"] == "sent")
    if told:
        story.append(f"{told} of {len(passengers)} passengers have a message on their phone. {sent} staff instructions were sent and {waiting} are waiting for a person.")

    return {"story": story, "passengers": passengers, "ops": ops,
            "connection": {"inbound": flights.view(inbound), "outbound": flights.view(outbound), "left_min": base.left_min, "needed_min": base.needed_min, "buffer_min": base.buffer_min, "level": level, "source": risk.source if risk else None}}
