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
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import buffer as buf
from ..core.breaker import Breaker
from ..core.bus import redis
from ..core.db import AssistanceNeed, Connection, ConnectionRisk, Consent, Decision, FlightInstance, Itinerary, Outbox, now
from ..core.settings import get_settings
from ..core.trace import trace
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


async def connection_risk(db: AsyncSession, connection: Connection, inbound: FlightInstance, outbound: FlightInstance, base: buf.Buffer, event_id: str | None = None) -> tuple[dict, bool]:
    """The cached part. Returns (risk, from_cache)."""
    version = f"{inbound.version}.{outbound.version}"
    label = f"{inbound.flight_iata} → {outbound.flight_iata}"
    key = risk_cache_key(connection.id, version)
    cached = await redis().get(key)
    if cached:
        risk = json.loads(cached)
        await trace(event_id, "risk", f"Risk for {label}: {LABEL[risk['level']]}, served from cache", connection=label, level=risk["level"], cache="hit", version=version, model_ms=0)
        return risk, True
    started = time.perf_counter()

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
    elapsed = round((time.perf_counter() - started) * 1000)
    await trace(event_id, "risk", f"Risk for {label}: {LABEL[level]}" + (" (model call, now cached)" if source == "model" else " (fixed rules: model unavailable)"), connection=label, level=level, cache="miss", source=source, confidence=round(confidence, 2), probabilities=probabilities, time_margin=state["time_margin"], version=version, model_ms=elapsed if source == "model" else 0)
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
    payload["event_id"] = event_id  # lets the relay and consumers add to the same trace
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
        db.add(Outbox(message_id=f"{key}:ops", routing_key="ops.action", payload={"decision_id": decision.id, "connection_id": connection.id, "event_id": event_id}, expires_at=expires_at))
    GATE = {"auto": "runs by itself", "approval": "waits for ops approval", "human": "needs a person"}
    await trace(event_id, "decision", f"{ops_text[0]}: {GATE[gate]}", type=decision_type, answer=answer, confidence=round(confidence, 2), gate=gate, target=target if gate == "auto" else "ops.action", seat=itinerary.seat if itinerary else None)
    result.decisions.append(decision)


NEGATIVE = ("no", "none")


async def _withdraw(db: AsyncSession, result: Result, *, event_id: str, connection: Connection, itinerary: Itinerary, decision_type: str, target: str, expires_at: datetime | None) -> None:
    """The situation changed and an earlier instruction no longer applies: take it back, so staff never act on stale advice."""
    last = (await db.execute(select(Decision).where(Decision.itinerary_id == itinerary.id, Decision.type == decision_type).order_by(Decision.created_at.desc()).limit(1))).scalar_one_or_none()
    if last is None or last.answer in NEGATIVE or last.status in ("dismissed", "expired"):
        return
    if last.status == "pending":
        last.status = "expired"  # it was still waiting for a person: nothing was sent, so there is nothing to recall
        await db.flush()
        await trace(event_id, "decision", f"Withdrawn before it was sent: {(last.payload or {}).get('title', decision_type)}", type=decision_type, answer="withdrawn", confidence=1.0, gate="auto", target="ops.action", seat=itinerary.seat)
        return
    negative = "none" if decision_type == "ground_dispatch" else "no"
    await _decide(db, result, event_id=event_id, connection=connection, itinerary=itinerary, decision_type=decision_type, answer=negative, confidence=1.0, probabilities={}, target=target, gate="auto",
                  payload={"itinerary_id": itinerary.id, "connection_id": connection.id, "seat": itinerary.seat, "retract": True},
                  ops_text=(f"Withdrawn for seat {itinerary.seat or '?'}: {(last.payload or {}).get('title', decision_type)}", "The situation changed, so this instruction no longer applies."), expires_at=expires_at)


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
    label = f"{inbound.flight_iata} → {outbound.flight_iata}"
    await trace(event_id, "buffer", f"Time buffer for {label}: {base.buffer_min} min", connection=label, left_min=base.left_min, needed_min=base.needed_min, buffer_min=base.buffer_min, steps=[{"label": text, "minutes": minutes} for _, text, minutes in base.steps if minutes])
    risk, result.risk_from_cache = await connection_risk(db, connection, inbound, outbound, base, event_id)
    result.risk, result.degraded = risk, risk["source"] == "rules"

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
        # Only single-ticket passengers are the airline's to hold or rebook for.
        protected = sum(1 for i in itineraries if i.booking != "separate_tickets")
        try:
            ops = await Breaker(redis(), "model").call(lambda: model.ask_ops({"risk_level": level, "protected_passengers": protected, "self_transfer_passengers": len(itineraries) - protected, "outbound_status": outbound.status}))
            await trace(event_id, "ops", f"Ops question for {label}: {ops.answer.replace('_', ' ')}", connection=label, answer=ops.answer, confidence=round(ops.confidence, 2), probabilities=ops.probabilities, protected_passengers=protected, self_transfer_passengers=len(itineraries) - protected)
            if ops.answer not in ("none", "monitor", "notify_only"):
                text = {"hold_flight": (f"Hold {outbound.flight_iata}", f"{protected} single-ticket passenger(s) on {label} are rated {LABEL[level]}; the buffer is {base.buffer_min} min."),
                        "escort": (f"Send escorts for {label}", f"{protected} single-ticket passenger(s) need help on the ground. No hold needed."),
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
        my_buffer = base.buffer_min - buf.passenger_offset(connection.airport, base, itinerary.seat, assistance, itinerary.booking)
        my_level = max(level, buf.rule_level(my_buffer), key=SEVERITY.get) if my_buffer < base.buffer_min else level
        common = {"itinerary_id": itinerary.id, "connection_id": connection.id, "seat": itinerary.seat, "buffer_min": my_buffer, "level": my_level, "booking": itinerary.booking}

        async def message(template: str, confidence: float = 1.0, probabilities: dict | None = None) -> None:
            if "notifications" in consents:
                await _decide(db, result, event_id=event_id, connection=connection, itinerary=itinerary, decision_type="message_template", answer=template, confidence=confidence, probabilities=probabilities or {}, target="pax.alert", gate="auto",
                              payload={**common, "principal_id": itinerary.principal_id, "template": template, "vars": {"outbound": outbound.flight_iata, "dest": outbound.dest, "gate": outbound.dep_gate or "", "seat": itinerary.seat or "", "buffer": my_buffer}},
                              ops_text=("Passenger message", template), expires_at=departure)

        withdraw = lambda decision_type, target, until: _withdraw(db, result, event_id=event_id, connection=connection, itinerary=itinerary, decision_type=decision_type, target=target, expires_at=until)
        if my_level == "safe":
            for decision_type, target, until in (("crew_priority_deplane", "crew.deplane", arrival), ("ground_dispatch", "ground.dispatch", departure), ("request_fast_track", "authority.fasttrack", departure)):
                await withdraw(decision_type, target, until)
            await trace(event_id, "passenger", f"Seat {itinerary.seat or '?'}: safe, no model call needed", connection=label, seat=itinerary.seat, level=my_level, buffer_min=my_buffer, booking=itinerary.booking, answers={})
            await message("on_track")  # no model call for a safe passenger
            continue
        try:
            answers = await Breaker(redis(), "model").call(lambda: model.ask_passenger({"risk_level": my_level, "booking": itinerary.booking, "declared_assistance": assistance or "none", "terminal_change": bool(inbound.arr_terminal and outbound.dep_terminal and inbound.arr_terminal != outbound.dep_terminal)}))
        except Exception as error:
            log.warning("passenger questions skipped: %s", type(error).__name__)
            continue

        await trace(event_id, "passenger", f"Seat {itinerary.seat or '?'}: six decisions in one model call", connection=label, seat=itinerary.seat, level=my_level, buffer_min=my_buffer, booking=itinerary.booking, answers={name: {"answer": a.answer, "confidence": round(a.confidence, 2)} for name, a in answers.items() if name != "needs_assistance" or assistance})
        shown_assistance = assistance if assistance and answers["needs_assistance"].answer == "yes" else None
        deplane = answers["crew_priority_deplane"]
        if deplane.answer == "yes":
            await _decide(db, result, event_id=event_id, connection=connection, itinerary=itinerary, decision_type="crew_priority_deplane", answer="yes", confidence=deplane.confidence, probabilities=deplane.probabilities, target="crew.deplane",
                          payload={**common, "flight_id": inbound.id, "onward": outbound.flight_iata, "onward_dest": outbound.dest, "assistance": shown_assistance},
                          ops_text=(f"Call seat {itinerary.seat or '?'} off first", f"{label}: buffer {my_buffer} min."), expires_at=arrival)
        else:
            await withdraw("crew_priority_deplane", "crew.deplane", arrival)
        dispatch = answers["ground_dispatch"]
        if dispatch.answer == "none":
            await withdraw("ground_dispatch", "ground.dispatch", departure)
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
        if not (fast.answer == "yes" and "authority_share" in consents):
            await withdraw("request_fast_track", "authority.fasttrack", departure)
        template = answers["message_template"]
        if template.confidence >= get_settings().gate_approval:
            await message(template.answer, template.confidence, template.probabilities)
        else:
            fallback = {"tight": "self_transfer_hurry", "at_risk": "self_transfer_hurry", "lost": "self_transfer_missed"} if itinerary.booking == "separate_tickets" else {"tight": "hurry", "at_risk": "hurry", "lost": "rebooked"}
            await message(fallback[my_level])
    return result
