"""Staff routes. Every route names the roles that may use it; reads of personal or assistance data are audited."""
import hashlib
from typing import Literal

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.breaker import Breaker
from ..core.bus import TOPIC_FLIGHT, notify, redis
from ..core.db import uid, AssistanceNeed, Connection, ConnectionRisk, Decision, FeedItem, FlightInstance, Itinerary, Outbox, PassengerPII, StaffUser, now
from ..core.util import decrypt, hash_password, mask_name, needs_rehash, verify_password
from ..flights import service as flights
from ..privacy.service import active_consents, audit
from .deps import client_address, end_all_sessions, get_db, issue_staff, limit, revoke_staff, sse, staff, staff_alive

router = APIRouter()


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


# Checked when the account does not exist, so a wrong address takes as long to refuse as a wrong password.
DUMMY_HASH = hash_password("no such account")


@router.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    # Five wrong passwords per account and address in ten minutes, then a pause.
    # Counted per account, whatever address the attempts claim to come from, and per address as well.
    account = "login:" + hashlib.sha256(email.encode()).hexdigest()[:24]
    keys = (account, f"login-from:{client_address(request)}")
    if int(await redis().get(keys[0]) or 0) >= 5 or int(await redis().get(keys[1]) or 0) >= 20:
        raise HTTPException(429, "Too many attempts. Wait ten minutes and try again.")
    user = (await db.execute(select(StaffUser).where(StaffUser.email == email))).scalar_one_or_none()
    if not verify_password(body.password, user.password_hash if user else DUMMY_HASH) or user is None:
        for key in keys:
            await limit(key, 10**6, 600, "")
        # The typed address is not stored: it may be a password put in the wrong field.
        await audit(db, user.email if user else "unknown", "unknown", "login:failed", "staff")
        await db.commit()
        raise HTTPException(401, "Wrong email or password.")  # the same answer whether the account exists or not
    await redis().delete(account)
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)  # stored under an older, cheaper setting: upgrade it now that we hold the password
    await issue_staff(response, user)
    await audit(db, user.email, user.role, "login", "staff")
    await db.commit()
    return {"email": user.email, "role": user.role}


@router.post("/auth/logout", status_code=204)
async def logout(request: Request) -> Response:
    out = Response(status_code=204)
    await revoke_staff(request, out)
    return out


class PasswordIn(BaseModel):
    current: str = Field(max_length=200)
    new: str = Field(min_length=12, max_length=200)


@router.post("/auth/password")
async def change_password(body: PasswordIn, response: Response, user: dict = staff(), db: AsyncSession = Depends(get_db)) -> dict:
    await limit(f"password:{user['id']}", 5, 600, "Too many attempts. Wait ten minutes and try again.")
    account = await db.get(StaffUser, user["id"])
    if account is None or not verify_password(body.current, account.password_hash):
        raise HTTPException(403, "The current password is wrong.")
    account.password_hash = hash_password(body.new)
    await audit(db, user["email"], user["role"], "password:changed", "staff")
    await db.commit()
    await end_all_sessions(account.id)  # every other device is signed out
    await issue_staff(response, account)
    return {"ok": True}


@router.post("/auth/logout-all", status_code=204)
async def logout_everywhere(request: Request, user: dict = staff(), db: AsyncSession = Depends(get_db)) -> Response:
    out = Response(status_code=204)
    await end_all_sessions(user["id"])
    await revoke_staff(request, out)
    await audit(db, user["email"], user["role"], "logout:all", "staff")
    await db.commit()
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


async def _decide(db: AsyncSession, request: Request, decision_id: str, user: dict, verdict: Literal["approved", "dismissed"]) -> dict:
    decision = await db.get(Decision, decision_id)
    if decision is None:
        raise HTTPException(404, "No such decision.")
    if decision.status != "pending":
        raise HTTPException(409, f"Already {decision.status}.")
    decision.status, decision.decided_by = verdict, user["email"]
    payload = decision.payload or {}
    target = payload.get("target")
    if verdict == "approved" and decision.type == "request_fast_track" and "authority_share" not in await active_consents(db, decision.principal_id or ""):
        decision.status = "expired"
        await db.commit()
        raise HTTPException(409, "The passenger has withdrawn consent to share with the airport. Nothing was sent.")
    if verdict == "approved" and target and target != "ops.action":
        # Approval releases the action to its audience, through the same outbox as everything else.
        expires = datetime.fromisoformat(payload["expires_at"]) if payload.get("expires_at") else None
        db.add(Outbox(message_id=f"{decision.idempotency_key}:{target}", routing_key=target, payload={**payload.get("message", {}), "decision_id": decision.id}, priority=payload.get("priority", 0), expires_at=expires))
    held = None
    if verdict == "approved" and decision.type == "ops_action" and decision.answer == "hold_flight":
        # Approving a hold changes the world: the outbound flight now leaves later.
        message = payload.get("message") or {}
        held = await db.get(FlightInstance, message.get("flight_id") or "")
        if held is not None and (held.est_dep or held.sched_dep):
            current = held.est_dep or held.sched_dep
            current = current if current.tzinfo else current.replace(tzinfo=timezone.utc)
            flights.apply(held, {"est_dep": current + timedelta(minutes=int(message.get("hold_min", 0)))}, "manual")
    await audit(db, user["email"], user["role"], f"decision:{verdict}", f"{decision.type}:{decision.id}")
    await db.commit()
    # The decision goes back through Redpanda, so the engine re-scores the connection with what is now true:
    # a hold gives every passenger more time, and any instruction that no longer applies is withdrawn.
    producer = request.app.state.producer
    if held is not None:
        await flights.publish_update(producer, held)
    else:
        connection = await db.get(Connection, decision.connection_id)
        await producer.send_and_wait(TOPIC_FLIGHT, key=connection.inbound_id, value={"type": "connection.reevaluate", "event_id": uid(), "connection_id": connection.id, "reason": f"{decision.type}:{verdict}"})
    await notify("ops")
    inbound_outbound = await db.get(Connection, decision.connection_id)
    a, b = await db.get(FlightInstance, inbound_outbound.inbound_id), await db.get(FlightInstance, inbound_outbound.outbound_id)
    return await action_view(db, decision, {decision.connection_id: f"{a.flight_iata} → {b.flight_iata}"})


@router.post("/ops/decisions/{decision_id}/approve")
async def approve(decision_id: str, request: Request, user: dict = staff("ops"), db: AsyncSession = Depends(get_db)) -> dict:
    return await _decide(db, request, decision_id, user, "approved")


@router.post("/ops/decisions/{decision_id}/dismiss")
async def dismiss(decision_id: str, request: Request, user: dict = staff("ops"), db: AsyncSession = Depends(get_db)) -> dict:
    return await _decide(db, request, decision_id, user, "dismissed")


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
        names = await _masked_names(db, [p.get("itinerary_id") for p in items])
        needs = await _needs(db, [p.get("itinerary_id") for p in items])
        out.append({"flight": flights.view(flight), "items": [{"rank": i + 1, "seat": p.get("seat"), "name": names.get(p.get("itinerary_id")), "onward": p["onward"], "onward_dest": p["onward_dest"], "buffer_min": p["buffer_min"], "level": p["level"], "assistance": needs.get(p.get("itinerary_id")), "booking": p.get("booking", "single_ticket")} for i, p in enumerate(items)]})
    await audit(db, user["email"], user["role"], "read", "crew list (seats, masked names, assistance flags)")
    await db.commit()
    return out


async def _masked_names(db: AsyncSession, itinerary_ids: list[str | None]) -> dict[str, str | None]:
    """Staff see a masked name (P***a S***a): enough to confirm the person in front of them."""
    out = {}
    for itinerary_id in {i for i in itinerary_ids if i}:
        itinerary = await db.get(Itinerary, itinerary_id)
        pii = await db.get(PassengerPII, itinerary.principal_id) if itinerary else None
        out[itinerary_id] = mask_name(decrypt(pii.name_enc)) if pii else None
    return out


async def _needs(db: AsyncSession, itinerary_ids: list[str | None]) -> dict[str, str]:
    """Declared assistance needs, read from the encrypted table at the moment a staff list is opened,
    and only for passengers whose `assistance` consent still stands. Never copied into messages."""
    out = {}
    for itinerary_id in {i for i in itinerary_ids if i}:
        need = await db.get(AssistanceNeed, itinerary_id)
        itinerary = await db.get(Itinerary, itinerary_id) if need else None
        if need and itinerary and "assistance" in await active_consents(db, itinerary.principal_id):
            out[itinerary_id] = decrypt(need.type_enc)
    return out


def _job(item: FeedItem, name: str | None = None, assistance: str | None = None) -> dict:
    p = item.payload
    return {"id": item.id, "name": name, "kind": p["kind"], "assistance": assistance, "seat": p.get("seat"), "from_gate": p.get("from_gate"), "to_gate": p.get("to_gate"), "inbound": p["inbound"], "outbound": p["outbound"], "buffer_min": p["buffer_min"], "priority": p.get("priority", 0), "status": item.status, "created_at": item.created_at.isoformat()}


@router.get("/ground/queue")
async def ground_queue(user: dict = staff("ground", "ops"), db: AsyncSession = Depends(get_db)) -> list[dict]:
    items = await _feed(db, "ground")
    names = await _masked_names(db, [item.payload.get("itinerary_id") for item in items])
    needs = await _needs(db, [item.payload.get("itinerary_id") for item in items])
    jobs = [_job(item, names.get(item.payload.get("itinerary_id")), needs.get(item.payload.get("itinerary_id"))) for item in items]
    jobs.sort(key=lambda j: (j["status"] == "done", -j["priority"], j["buffer_min"]))
    await audit(db, user["email"], user["role"], "read", "dispatch queue (seats, masked names, assistance kind)")
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
        if pii is None or "authority_share" not in await active_consents(db, pii.principal_id):
            continue  # shared only while the passenger's consent stands
        out.append({"id": item.id, "name": mask_name(decrypt(pii.name_enc)) if pii else None, "inbound": p["inbound"], "outbound": p["outbound"], "airport": p["airport"], "deadline": p.get("deadline"), "level": p["level"], "created_at": item.created_at.isoformat()})
    # The one place a name leaves the airline: only with the passenger's consent, and always logged.
    await audit(db, user["email"], user["role"], "read", f"fast-track requests with masked names ({len(out)})")
    await db.commit()
    return out


@router.get("/staff/stream")
async def staff_stream(audience: Literal["ops", "crew", "ground", "authority"], user: dict = staff()):
    if user["role"] not in ("admin", audience) and not (user["role"] == "ops" and audience in ("crew", "ground")):
        raise HTTPException(403, "Your role cannot use this.")
    return await sse(f"live:{audience}", user["id"], lambda: staff_alive(user))
