"""The connection engine.

For one connection and one event:
  1. time buffer, in code
  2. risk: Redis hit on (connection, version), else the model (Call A), then cache
  3. decisions: the model again (never cached), then confidence gating
  4. decisions and outbox rows are added to ONE transaction; the caller commits it

If the model is unavailable (breaker open, timeout, error) the risk comes from fixed
thresholds on the buffer, nothing is automated, and non-safe connections go to ops for review.
"""
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import buffer as buf
from ..core.breaker import Breaker
from ..core.bus import redis
from ..core.db import AssistanceNeed, Connection, ConnectionRisk, Consent, Decision, FlightInstance, Itinerary, Outbox, now
from ..core.settings import get_settings
from ..core.util import decrypt, idempotency_key, risk_cache_key
from ..model import client as model

log = logging.getLogger("segue.engine")

SEVERITY = {"safe": 0, "tight": 1, "at_risk": 2, "lost": 3}
LABEL = {"safe": "Safe", "tight": "Tight", "at_risk": "At Risk", "lost": "Lost"}
# Actions with a real cost or that share data outside the airline never run without a person.
NEEDS_APPROVAL = {"hold_flight", "rebook", "request_fast_track"}
RISK_TTL_S = 6 * 3600


@dataclass
class Result:
    connection_id: str
    risk: dict | None = None
    risk_from_cache: bool = False
    degraded: bool = False
    decisions: list[Decision] = field(default_factory=list)
    principals: set[str] = field(default_factory=set)


def _aware(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def gate_for(answer: str, decision_type: str, confidence: float) -> str:
    """auto: runs by itself. approval: ops must approve. human: too uncertain, a person decides."""
    s = get_settings()
    if confidence < s.gate_approval:
        return "human"
    if answer in NEEDS_APPROVAL or decision_type in NEEDS_APPROVAL or confidence < s.gate_auto:
        return "approval"
    return "auto"


async def connection_risk(db: AsyncSession, connection: Connection, inbound: FlightInstance, outbound: FlightInstance, base: buf.Buffer) -> tuple[dict, bool]:
    """The cached part. Returns (risk, from_cache)."""
    version = f"{inbound.version}.{outbound.version}"
    key = risk_cache_key(connection.id, version)
    cached = await redis().get(key)
    if cached:
        return json.loads(cached), True

    # The exact minutes stay in code; the model sees the band they fall in, plus context.
    state = {
        "time_margin": buf.margin_band(base.buffer_min),
        "terminal_change": bool(inbound.arr_terminal and outbound.dep_terminal and inbound.arr_terminal != outbound.dep_terminal),
        "queue_trend": "steady",  # no live queue feed yet
        "inbound_status": inbound.status, "outbound_status": outbound.status,
    }
    source = "model"
    try:
        answer = await Breaker(redis(), "model").call(lambda: model.ask_risk(state))
        level, confidence, probabilities = answer.answer, answer.confidence, answer.probabilities
    except Exception as error:  # breaker open, timeout, bad response: degrade, never guess
        log.warning("model unavailable for risk, using rules: %s", type(error).__name__)
        source, level, confidence, probabilities = "rules", buf.rule_level(base.buffer_min), 1.0, {}

    risk = {
        "level": level, "left_min": base.left_min, "needed_min": base.needed_min, "buffer_min": base.buffer_min,
        "confidence": confidence, "probabilities": probabilities, "source": source, "version": version, "computed_at": now().isoformat(),
    }
    row = await db.get(ConnectionRisk, (connection.id, version))
    if row is None:
        row = ConnectionRisk(connection_id=connection.id, version=version)
        db.add(row)
    row.left_min, row.needed_min, row.buffer_min = base.left_min, base.needed_min, base.buffer_min
    row.level, row.probabilities, row.confidence, row.source, row.computed_at = level, probabilities, confidence, source, now()
    if source == "model":
        # A rules result is not cached, so the model's answer replaces it as soon as the model is back.
        await redis().set(key, json.dumps(risk), ex=RISK_TTL_S)
    return risk, False


async def _consents(db: AsyncSession, principal_id: str) -> set[str]:
    rows = (await db.execute(select(Consent.purpose).where(Consent.principal_id == principal_id, Consent.withdrawn_at.is_(None)))).scalars()
    return set(rows)


async def _unchanged(db: AsyncSession, connection_id: str, itinerary_id: str | None, decision_type: str, answer: str) -> bool:
    """Only a change is news: skip a decision equal to the latest live one of its kind."""
    query = select(Decision).where(Decision.connection_id == connection_id, Decision.type == decision_type).order_by(Decision.created_at.desc()).limit(1)
    query = query.where(Decision.itinerary_id == itinerary_id) if itinerary_id else query.where(Decision.itinerary_id.is_(None))
    last = (await db.execute(query)).scalar_one_or_none()
    return last is not None and last.answer == answer and last.status != "dismissed"


async def _decide(db: AsyncSession, result: Result, *, event_id: str, connection: Connection, itinerary: Itinerary | None, decision_type: str, answer: str, confidence: float, probabilities: dict, target: str, payload: dict, ops_text: tuple[str, str], expires_at: datetime | None, priority: int = 0, gate: str | None = None) -> None:
    itinerary_id = itinerary.id if itinerary else None
    key = idempotency_key(connection.id, itinerary_id, decision_type, event_id)
    if (await db.execute(select(Decision.id).where(Decision.idempotency_key == key))).first():
        return  # this event was already processed
    if await _unchanged(db, connection.id, itinerary_id, decision_type, answer):
        return
    gate = gate or gate_for(answer, decision_type, confidence)
    decision = Decision(
        idempotency_key=key, connection_id=connection.id, itinerary_id=itinerary_id, principal_id=itinerary.principal_id if itinerary else None,
        type=decision_type, answer=answer, probabilities=probabilities, confidence=confidence, gate=gate,
        status="executed" if gate == "auto" else "pending",
        payload={"target": target, "message": payload, "priority": priority, "title": ops_text[0], "detail": ops_text[1], "expires_at": expires_at.isoformat() if expires_at else None},
    )
    db.add(decision)
    await db.flush()
    payload["decision_id"] = decision.id
    if gate == "auto":
        db.add(Outbox(message_id=f"{key}:{target}", routing_key=target, payload=payload, priority=priority, expires_at=expires_at))
    if gate != "auto" or target == "ops.action":
        # Anything that needs a person lands on the ops dashboard.
        db.add(Outbox(message_id=f"{key}:ops", routing_key="ops.action", payload={"decision_id": decision.id, "connection_id": connection.id}, expires_at=expires_at))
    result.decisions.append(decision)


async def process_connection(db: AsyncSession, connection_id: str, event_id: str, only_itinerary: str | None = None) -> Result:
    result = Result(connection_id)
    connection = await db.get(Connection, connection_id)
    if connection is None:
        return result
    inbound, outbound = await db.get(FlightInstance, connection.inbound_id), await db.get(FlightInstance, connection.outbound_id)
    arrival, departure = _aware(inbound.est_arr or inbound.sched_arr), _aware(outbound.est_dep or outbound.sched_dep)
    if arrival is None or departure is None:
        return result  # nothing to score until both times are known

    base = buf.connection_buffer(connection.airport, arrival, departure, inbound.arr_terminal, outbound.dep_terminal)
    risk, result.risk_from_cache = await connection_risk(db, connection, inbound, outbound, base)
    result.risk, result.degraded = risk, risk["source"] == "rules"
    label = f"{inbound.flight_iata} → {outbound.flight_iata}"

    itineraries = list((await db.execute(select(Itinerary).where(Itinerary.connection_id == connection.id))).scalars())
    result.principals = {i.principal_id for i in itineraries}
    level = risk["level"]

    if result.degraded:
        if level != "safe":
            await _decide(db, result, event_id=event_id, connection=connection, itinerary=None, decision_type="review", answer=level, confidence=1.0, probabilities={}, target="ops.action", payload={}, gate="human",
                          ops_text=(f"Review {label}", f"Degraded mode: the model is unavailable. Fixed rules rate this connection {LABEL[level]}, with a buffer of {base.buffer_min} min."), expires_at=departure)
        return result

    # Connection-level ops action: one question for the whole flight pair. Never cached.
    if level != "safe" and itineraries:
        try:
            ops = await Breaker(redis(), "model").call(lambda: model.ask_ops({"risk_level": level, "passengers_on_connection": len(itineraries), "outbound_status": outbound.status}))
            if ops.answer not in ("none", "monitor"):
                text = {"hold_flight": (f"Hold {outbound.flight_iata}", f"{len(itineraries)} passenger(s) on {label} are rated {LABEL[level]}; the buffer is {base.buffer_min} min."),
                        "escort": (f"Send escorts for {label}", f"{len(itineraries)} passenger(s) need help on the ground. No hold needed."),
                        "rebook": (f"Rebook passengers on {label}", f"The connection cannot be made (buffer {base.buffer_min} min).")}[ops.answer]
                await _decide(db, result, event_id=event_id, connection=connection, itinerary=None, decision_type="ops_action", answer=ops.answer, confidence=ops.confidence, probabilities=ops.probabilities, target="ops.action", payload={}, ops_text=text, expires_at=departure)
        except Exception as error:
            log.warning("ops question skipped: %s", type(error).__name__)

    for itinerary in itineraries:
        if only_itinerary and itinerary.id != only_itinerary:
            continue
        consents = await _consents(db, itinerary.principal_id)
        if "tracking" not in consents:
            continue
        assistance = None
        if "assistance" in consents:
            need = await db.get(AssistanceNeed, itinerary.id)
            assistance = decrypt(need.type_enc) if need else None
        my_buffer = base.buffer_min - buf.passenger_offset(connection.airport, base, itinerary.seat, assistance)
        my_level = max(level, buf.rule_level(my_buffer), key=SEVERITY.get) if my_buffer < base.buffer_min else level
        common = {"itinerary_id": itinerary.id, "connection_id": connection.id, "seat": itinerary.seat, "buffer_min": my_buffer, "level": my_level}

        async def message(template: str, confidence: float = 1.0, probabilities: dict | None = None) -> None:
            if "notifications" in consents:
                await _decide(db, result, event_id=event_id, connection=connection, itinerary=itinerary, decision_type="message_template", answer=template, confidence=confidence, probabilities=probabilities or {}, target="pax.alert", gate="auto",
                              payload={**common, "principal_id": itinerary.principal_id, "template": template, "vars": {"outbound": outbound.flight_iata, "dest": outbound.dest, "gate": outbound.dep_gate or "", "seat": itinerary.seat or "", "buffer": my_buffer}},
                              ops_text=("Passenger message", template), expires_at=departure)

        if my_level == "safe":
            await message("on_track")  # no model call for a safe passenger
            continue
        try:
            answers = await Breaker(redis(), "model").call(lambda: model.ask_passenger({"risk_level": my_level, "declared_assistance": assistance or "none", "terminal_change": bool(inbound.arr_terminal and outbound.dep_terminal and inbound.arr_terminal != outbound.dep_terminal)}))
        except Exception as error:
            log.warning("passenger questions skipped: %s", type(error).__name__)
            continue

        shown_assistance = assistance if assistance and answers["needs_assistance"].answer == "yes" else None
        deplane = answers["crew_priority_deplane"]
        if deplane.answer == "yes":
            await _decide(db, result, event_id=event_id, connection=connection, itinerary=itinerary, decision_type="crew_priority_deplane", answer="yes", confidence=deplane.confidence, probabilities=deplane.probabilities, target="crew.deplane",
                          payload={**common, "flight_id": inbound.id, "onward": outbound.flight_iata, "onward_dest": outbound.dest, "assistance": shown_assistance},
                          ops_text=(f"Call seat {itinerary.seat or '?'} off first", f"{label}: buffer {my_buffer} min."), expires_at=arrival)
        dispatch = answers["ground_dispatch"]
        if dispatch.answer != "none":
            kind = answers["assistance_type"].answer if shown_assistance and answers["assistance_type"].answer != "none" else dispatch.answer
            priority = max(0, min(10, 10 - my_buffer // 5))
            await _decide(db, result, event_id=event_id, connection=connection, itinerary=itinerary, decision_type="ground_dispatch", answer=kind, confidence=dispatch.confidence, probabilities=dispatch.probabilities, target="ground.dispatch", priority=priority,
                          payload={**common, "kind": kind, "from_gate": inbound.arr_gate, "to_gate": outbound.dep_gate, "inbound": inbound.flight_iata, "outbound": outbound.flight_iata, "priority": priority},
                          ops_text=(f"Send {kind.replace('_', ' ')} for seat {itinerary.seat or '?'}", f"{label}: gate {inbound.arr_gate or '?'} to {outbound.dep_gate or '?'}, buffer {my_buffer} min."), expires_at=departure)
        fast = answers["request_fast_track"]
        if fast.answer == "yes" and "authority_share" in consents:
            # Leaves the airline, so it always waits for a person. It never carries assistance data.
            await _decide(db, result, event_id=event_id, connection=connection, itinerary=itinerary, decision_type="request_fast_track", answer="yes", confidence=fast.confidence, probabilities=fast.probabilities, target="authority.fasttrack",
                          payload={"itinerary_id": itinerary.id, "connection_id": connection.id, "principal_id": itinerary.principal_id, "inbound": inbound.flight_iata, "outbound": outbound.flight_iata, "airport": connection.airport, "deadline": departure.isoformat(), "level": my_level},
                          ops_text=(f"Request fast-track for seat {itinerary.seat or '?'}", f"{label}: the queue is the risk. The airport decides."), expires_at=departure)
        template = answers["message_template"]
        if template.confidence >= get_settings().gate_approval:
            await message(template.answer, template.confidence, template.probabilities)
        else:
            await message({"tight": "hurry", "at_risk": "hurry", "lost": "rebooked"}[my_level])
    return result
