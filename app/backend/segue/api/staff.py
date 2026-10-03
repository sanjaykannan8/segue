"""Staff routes. Every route names the roles that may use it; reads of personal or assistance data are audited."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.breaker import Breaker
from ..core.bus import notify, redis
from ..core.db import Connection, ConnectionRisk, Decision, FeedItem, FlightInstance, Itinerary, Outbox, PassengerPII, StaffUser, now
from ..core.util import decrypt, verify_password
from ..flights import service as flights
from ..privacy.service import audit
from .deps import STAFF_COOKIE, clear_cookie, get_db, set_cookie, sse, staff

router = APIRouter()


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
async def login(body: LoginIn, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    user = (await db.execute(select(StaffUser).where(StaffUser.email == body.email.strip().lower()))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password.")
    set_cookie(response, STAFF_COOKIE, {"id": user.id, "email": user.email, "role": user.role})
    await audit(db, user.email, user.role, "login", "staff")
    await db.commit()
    return {"email": user.email, "role": user.role}


@router.post("/auth/logout", status_code=204)
async def logout() -> Response:
    out = Response(status_code=204)
    clear_cookie(out, STAFF_COOKIE)
    return out


@router.get("/auth/me")
async def who(user: dict = staff()) -> dict:
    return {"email": user["email"], "role": user["role"]}


async def _risk(db: AsyncSession, connection: Connection, inbound: FlightInstance, outbound: FlightInstance) -> dict | None:
    row = await db.get(ConnectionRisk, (connection.id, f"{inbound.version}.{outbound.version}"))
    if row is None:
        return None
    return {"level": row.level, "left_min": row.left_min, "needed_min": row.needed_min, "buffer_min": row.buffer_min, "confidence": row.confidence, "probabilities": row.probabilities, "source": row.source, "version": row.version, "computed_at": row.computed_at.isoformat()}


async def action_view(db: AsyncSession, decision: Decision, labels: dict[str, str]) -> dict:
    seat = None
    if decision.itinerary_id:
        itinerary = await db.get(Itinerary, decision.itinerary_id)
        seat = itinerary.seat if itinerary else None
    payload = decision.payload or {}
    return {
        "decision_id": decision.id, "type": decision.type, "answer": decision.answer,
        "title": payload.get("title") or decision.type, "detail": payload.get("detail") or "",
        "connection_id": decision.connection_id, "connection_label": labels.get(decision.connection_id, ""), "seat": seat,
        "confidence": decision.confidence, "probabilities": decision.probabilities, "gate": decision.gate, "status": decision.status,
        "created_at": decision.created_at.isoformat(), "decided_by": decision.decided_by,
    }


@router.get("/ops/board")
async def board(user: dict = staff("ops"), db: AsyncSession = Depends(get_db)) -> dict:
    counts = {"safe": 0, "tight": 0, "at_risk": 0, "lost": 0}
    connections, labels = [], {}
    rows = (await db.execute(select(Connection, func.count(Itinerary.id)).join(Itinerary, Itinerary.connection_id == Connection.id).group_by(Connection.id))).all()
    for connection, passengers in rows:
        inbound, outbound = await db.get(FlightInstance, connection.inbound_id), await db.get(FlightInstance, connection.outbound_id)
        risk = await _risk(db, connection, inbound, outbound)
        if risk:
            counts[risk["level"]] += passengers
        labels[connection.id] = f"{inbound.flight_iata} → {outbound.flight_iata}"
        connections.append({"connection_id": connection.id, "airport": connection.airport, "inbound": flights.view(inbound), "outbound": flights.view(outbound), "risk": risk, "passengers": passengers})
    for connection in (await db.execute(select(Connection))).scalars():
        if connection.id not in labels:
            inbound, outbound = await db.get(FlightInstance, connection.inbound_id), await db.get(FlightInstance, connection.outbound_id)
            labels[connection.id] = f"{inbound.flight_iata} → {outbound.flight_iata}"
    # What ops sees: anything waiting for a person, plus ops' own actions. Routine passenger messages stay out.
    query = select(Decision).where((Decision.gate != "auto") | (Decision.type.in_(("ops_action", "review")))).where(Decision.type != "message_template").order_by((Decision.status != "pending"), Decision.created_at.desc()).limit(60)
    # A decision with no payload belonged to a passenger whose data has been erased: nothing left to show or do.
    actions = [await action_view(db, d, labels) for d in (await db.execute(query)).scalars() if (d.payload or {}).get("title")]
    connections.sort(key=lambda c: c["risk"]["buffer_min"] if c["risk"] else 9999)
    return {"counts": counts, "degraded": await Breaker(redis(), "model").is_open() or any(c["risk"] and c["risk"]["source"] == "rules" for c in connections), "connections": connections, "actions": actions}


async def _decide(db: AsyncSession, decision_id: str, user: dict, verdict: Literal["approved", "dismissed"]) -> dict:
    decision = await db.get(Decision, decision_id)
    if decision is None:
        raise HTTPException(404, "No such decision.")
    if decision.status != "pending":
        raise HTTPException(409, f"Already {decision.status}.")
    decision.status, decision.decided_by = verdict, user["email"]
    payload = decision.payload or {}
    target = payload.get("target")
    if verdict == "approved" and target and target != "ops.action":
        # Approval releases the action to its audience, through the same outbox as everything else.
        from datetime import datetime
        expires = datetime.fromisoformat(payload["expires_at"]) if payload.get("expires_at") else None
        db.add(Outbox(message_id=f"{decision.idempotency_key}:{target}", routing_key=target, payload={**payload.get("message", {}), "decision_id": decision.id}, priority=payload.get("priority", 0), expires_at=expires))
    await audit(db, user["email"], user["role"], f"decision:{verdict}", f"{decision.type}:{decision.id}")
    await db.commit()
    await notify("ops")
    inbound_outbound = await db.get(Connection, decision.connection_id)
    a, b = await db.get(FlightInstance, inbound_outbound.inbound_id), await db.get(FlightInstance, inbound_outbound.outbound_id)
    return await action_view(db, decision, {decision.connection_id: f"{a.flight_iata} → {b.flight_iata}"})


@router.post("/ops/decisions/{decision_id}/approve")
async def approve(decision_id: str, user: dict = staff("ops"), db: AsyncSession = Depends(get_db)) -> dict:
    return await _decide(db, decision_id, user, "approved")


@router.post("/ops/decisions/{decision_id}/dismiss")
async def dismiss(decision_id: str, user: dict = staff("ops"), db: AsyncSession = Depends(get_db)) -> dict:
    return await _decide(db, decision_id, user, "dismissed")


async def _feed(db: AsyncSession, audience: str) -> list[FeedItem]:
    return list((await db.execute(select(FeedItem).where(FeedItem.audience == audience).order_by(FeedItem.created_at.desc()).limit(200))).scalars())


@router.get("/crew/list")
async def crew_list(user: dict = staff("crew", "ops"), db: AsyncSession = Depends(get_db)) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for item in await _feed(db, "crew"):
        if item.status == "open":
            groups.setdefault(item.payload["flight_id"], []).append(item.payload)
    out = []
    for flight_id, items in groups.items():
        flight = await db.get(FlightInstance, flight_id)
        if flight is None:
            continue
        items.sort(key=lambda p: p["buffer_min"])
        out.append({"flight": flights.view(flight), "items": [{"rank": i + 1, "seat": p.get("seat"), "onward": p["onward"], "onward_dest": p["onward_dest"], "buffer_min": p["buffer_min"], "level": p["level"], "assistance": p.get("assistance"), "booking": p.get("booking", "single_ticket")} for i, p in enumerate(items)]})
    await audit(db, user["email"], user["role"], "read", "crew list (seats, assistance flags)")
    await db.commit()
    return out


def _job(item: FeedItem) -> dict:
    p = item.payload
    return {"id": item.id, "kind": p["kind"], "seat": p.get("seat"), "from_gate": p.get("from_gate"), "to_gate": p.get("to_gate"), "inbound": p["inbound"], "outbound": p["outbound"], "buffer_min": p["buffer_min"], "priority": p.get("priority", 0), "status": item.status, "created_at": item.created_at.isoformat()}


@router.get("/ground/queue")
async def ground_queue(user: dict = staff("ground", "ops"), db: AsyncSession = Depends(get_db)) -> list[dict]:
    jobs = [_job(item) for item in await _feed(db, "ground")]
    jobs.sort(key=lambda j: (j["status"] == "done", -j["priority"], j["buffer_min"]))
    await audit(db, user["email"], user["role"], "read", "dispatch queue (seats, assistance kind)")
    await db.commit()
    return jobs


@router.post("/ground/jobs/{job_id}/done")
async def job_done(job_id: str, user: dict = staff("ground"), db: AsyncSession = Depends(get_db)) -> dict:
    item = await db.get(FeedItem, job_id)
    if item is None or item.audience != "ground":
        raise HTTPException(404, "No such job.")
    item.status = "done"
    await audit(db, user["email"], user["role"], "job:done", job_id)
    await db.commit()
    await notify("ground")
    return _job(item)


@router.get("/authority/requests")
async def authority_requests(user: dict = staff("authority"), db: AsyncSession = Depends(get_db)) -> list[dict]:
    out = []
    for item in await _feed(db, "authority"):
        p = item.payload
        pii = await db.get(PassengerPII, p.get("principal_id")) if p.get("principal_id") else None
        out.append({"id": item.id, "name": decrypt(pii.name_enc) if pii else None, "inbound": p["inbound"], "outbound": p["outbound"], "airport": p["airport"], "deadline": p.get("deadline"), "level": p["level"], "created_at": item.created_at.isoformat()})
    # The one place a name leaves the airline: only with the passenger's consent, and always logged.
    await audit(db, user["email"], user["role"], "read", f"fast-track requests with names ({len(out)})")
    await db.commit()
    return out


@router.get("/staff/stream")
async def staff_stream(audience: Literal["ops", "crew", "ground", "authority"], user: dict = staff()):
    if user["role"] not in ("admin", audience) and not (user["role"] == "ops" and audience in ("crew", "ground")):
        raise HTTPException(403, "Your role cannot use this.")
    return sse(f"live:{audience}")
