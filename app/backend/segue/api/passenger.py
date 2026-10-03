"""Passenger routes: notice, consent, trip, feed, and the rights the DPDP Act gives the person."""
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import buffer as buf
from ..core.breaker import BreakerOpen
from ..core.bus import TOPIC_ITINERARY, notify, redis
from ..core.db import AssistanceNeed, Connection, ConnectionRisk, Consent, DataPrincipal, FeedItem, FlightInstance, Itinerary, PassengerPII, RightsRequest, now, uid
from ..core.settings import get_settings
from ..core.util import decrypt, encrypt
from ..flights import service as flights
from ..flights.provider import BudgetSpent, provider
from ..privacy import service as privacy
from .deps import PAX_COOKIE, clear_cookie, get_db, passenger, set_cookie, sse
from .notice import notice

router = APIRouter()
Assistance = Literal["none", "wheelchair", "buggy", "escort", "step_free_route"]


class ConsentIn(BaseModel):
    notice_version: str
    purposes: list[str]
    language: str = "en"
    adult: bool
    name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=20)


class Manual(BaseModel):
    origin: str = Field(min_length=3, max_length=4)
    dest: str = Field(min_length=3, max_length=4)
    sched_dep: datetime
    sched_arr: datetime
    dep_terminal: str | None = None
    arr_terminal: str | None = None
    dep_gate: str | None = None
    arr_gate: str | None = None


class FlightInput(BaseModel):
    flight_iata: str = Field(min_length=3, max_length=8)
    manual: Manual | None = None
    # Set both when the flight was picked from a departures list: the server then uses the row it already holds.
    dep_airport: str | None = Field(None, min_length=3, max_length=4)
    arr_airport: str | None = Field(None, min_length=3, max_length=4)


class ClaimIn(BaseModel):
    code: str = Field(min_length=6, max_length=12)


class ItineraryIn(BaseModel):
    inbound: FlightInput
    outbound: FlightInput
    seat: str | None = Field(None, max_length=6)
    assistance: Assistance | None = None
    # How the two flights were booked. Left out: inferred from the airline codes (same airline = one booking).
    booking: Literal["single_ticket", "separate_tickets"] | None = None


class ProfileIn(BaseModel):
    name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=20)
    language: str | None = None


class PurposeIn(BaseModel):
    purpose: str


class GrievanceIn(BaseModel):
    message: str = Field(min_length=3, max_length=2000)


class NomineeIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    contact: str = Field(min_length=3, max_length=120)


def _code(value: str) -> str:
    return value.replace(" ", "").upper()


async def me_view(db: AsyncSession, principal_id: str) -> dict:
    pii = await db.get(PassengerPII, principal_id)
    if pii is None:
        raise HTTPException(401, "Session no longer exists.")
    consents = (await db.execute(select(Consent).where(Consent.principal_id == principal_id).order_by(Consent.granted_at))).scalars()
    has = (await db.execute(select(Itinerary.id).where(Itinerary.principal_id == principal_id))).first() is not None
    iso = lambda v: v.isoformat() if v else None
    return {
        "principal_id": principal_id, "language": pii.language, "name": decrypt(pii.name_enc), "phone": decrypt(pii.phone_enc),
        "consents": [{"purpose": c.purpose, "granted_at": iso(c.granted_at), "withdrawn_at": iso(c.withdrawn_at)} for c in consents],
        "has_itinerary": has,
    }


async def connection_view(db: AsyncSession, itinerary: Itinerary) -> dict:
    connection = await db.get(Connection, itinerary.connection_id)
    inbound, outbound = await db.get(FlightInstance, connection.inbound_id), await db.get(FlightInstance, connection.outbound_id)
    version = f"{inbound.version}.{outbound.version}"
    row = await db.get(ConnectionRisk, (connection.id, version))
    risk = None
    if row:
        risk = {"level": row.level, "left_min": row.left_min, "needed_min": row.needed_min, "buffer_min": row.buffer_min, "confidence": row.confidence, "probabilities": row.probabilities, "source": row.source, "version": row.version, "computed_at": row.computed_at.isoformat()}
    aware = lambda v: v.replace(tzinfo=timezone.utc) if v and v.tzinfo is None else v
    arrival, departure = aware(inbound.est_arr or inbound.sched_arr), aware(outbound.est_dep or outbound.sched_dep)
    steps, my_buffer, assistance = [], None, None
    need = await db.get(AssistanceNeed, itinerary.id)
    if need and "assistance" in await privacy.active_consents(db, itinerary.principal_id):
        assistance = decrypt(need.type_enc)
    if arrival and departure:
        base = buf.connection_buffer(connection.airport, arrival, departure, inbound.arr_terminal, outbound.dep_terminal)
        steps = [{"id": step, "label": label, "minutes": minutes} for step, label, minutes in base.steps]
        my_buffer = base.buffer_min - buf.passenger_offset(connection.airport, base, itinerary.seat, assistance, itinerary.booking)
        if itinerary.booking == "separate_tickets":
            extra = int(buf.airport_config(connection.airport)["self_transfer_extra_min"])
            steps.insert(2, {"id": "recheck", "label": "Collect and re-check your bag", "minutes": extra})
    return {
        "itinerary_id": itinerary.id, "connection_id": connection.id, "airport": connection.airport,
        "inbound": flights.view(inbound), "outbound": flights.view(outbound), "seat": itinerary.seat, "booking": itinerary.booking,
        "risk": risk, "my_buffer_min": my_buffer, "steps": steps,
        "assistance": {"type": assistance} if assistance else None,
        "degraded": bool(risk and risk["source"] == "rules"),
    }


@router.get("/notice")
async def get_notice(lang: str = "en") -> dict:
    return notice(lang)


@router.post("/consent")
async def give_consent(body: ConsentIn, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    if not body.adult:
        raise HTTPException(400, "Segue is for people aged 18 or over.")
    purposes = [p for p in dict.fromkeys(body.purposes) if p in privacy.PURPOSES]
    if "tracking" not in purposes:
        raise HTTPException(400, "Tracking your connection is required to use Segue.")
    if body.notice_version != get_settings().notice_version:
        raise HTTPException(400, "The notice has changed. Please read the current version.")
    principal = DataPrincipal(id=uid())
    db.add(principal)
    await db.flush()
    db.add(PassengerPII(principal_id=principal.id, name_enc=encrypt(body.name), phone_enc=encrypt(body.phone), language=body.language if body.language in ("en", "hi") else "en"))
    for purpose in purposes:
        db.add(Consent(principal_id=principal.id, purpose=purpose, notice_version=body.notice_version))
    await privacy.audit(db, principal.id, "passenger", "consent:given", ",".join(purposes))
    await db.commit()
    set_cookie(response, PAX_COOKIE, {"principal_id": principal.id})
    return {"principal_id": principal.id, "purposes": purposes}


@router.get("/me")
async def me(principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    return await me_view(db, principal_id)


async def _lookup(db: AsyncSession, flight_iata: str) -> FlightInstance | None:
    """A recent row for this flight if we have one (no query spent), else one provider query."""
    code = _code(flight_iata)
    recent = (await db.execute(select(FlightInstance).where(FlightInstance.flight_iata == code).order_by(FlightInstance.date.desc()).limit(1))).scalar_one_or_none()
    if recent and recent.sched_dep and (recent.sched_dep if recent.sched_dep.tzinfo else recent.sched_dep.replace(tzinfo=timezone.utc)) > now() - timedelta(hours=18):
        return recent
    try:
        data = await provider().fetch(code)
    except BudgetSpent:
        raise HTTPException(503, "The flight data allowance is used up. Enter the flight details by hand.")
    except BreakerOpen:
        raise HTTPException(503, "Flight data is unavailable right now. Enter the flight details by hand.")
    except RuntimeError as error:
        raise HTTPException(503, str(error))
    except Exception:
        raise HTTPException(503, "Flight data is unavailable right now. Enter the flight details by hand.")
    if data is None:
        return None
    flight, _ = await flights.upsert(db, data, "airlabs")
    flight.polled_at = now()
    return flight


@router.post("/flights/lookup")
async def lookup(body: FlightInput, principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    flight = await _lookup(db, body.flight_iata)
    if flight is None:
        raise HTTPException(404, "No live data for that flight. Enter the details by hand.")
    await db.commit()
    return {"flight": flights.view(flight)}


async def _resolve(db: AsyncSession, item: FlightInput) -> FlightInstance:
    if item.manual:
        m = item.manual
        data = {"flight_iata": _code(item.flight_iata), "date": m.sched_dep.astimezone(timezone.utc).strftime("%Y-%m-%d"), "origin": _code(m.origin), "dest": _code(m.dest), "sched_dep": m.sched_dep, "est_dep": m.sched_dep, "sched_arr": m.sched_arr, "est_arr": m.sched_arr, "dep_terminal": m.dep_terminal, "arr_terminal": m.arr_terminal, "dep_gate": m.dep_gate, "arr_gate": m.arr_gate, "status": "scheduled"}
        flight, _ = await flights.upsert(db, data, "manual")
        return flight
    if item.dep_airport or item.arr_airport:
        # Picked from a list we already hold: no query spent.
        held = await _departures(_code(item.dep_airport), _code(item.arr_airport) if item.arr_airport else None) if item.dep_airport else await _arrivals(_code(item.arr_airport))
        for row in held:
            if row["flight_iata"] == _code(item.flight_iata):
                data = {**row, **{k: datetime.fromisoformat(row[k]) if row[k] else None for k in ("sched_dep", "est_dep", "sched_arr", "est_arr")}}
                flight, _ = await flights.upsert(db, data, "airlabs")
                return flight
    flight = await _lookup(db, item.flight_iata)
    if flight is None:
        raise HTTPException(404, f"No live data for {item.flight_iata}. Enter the details by hand.")
    return flight


async def _provider_call(fn):
    try:
        return await fn()
    except BudgetSpent:
        raise HTTPException(503, "The flight data allowance is used up. Enter the flight details by hand.")
    except RuntimeError as error:
        raise HTTPException(503, str(error))
    except Exception:
        raise HTTPException(503, "Flight data is unavailable right now. Enter the flight details by hand.")


async def _departures(airport: str, to: str | None = None) -> list[dict]:
    """Departures for a route, cached for ten minutes so searching does not drain the query allowance."""
    key = f"sched:{airport}:{to or '*'}"
    cached = await redis().get(key)
    if cached:
        return json.loads(cached)
    rows = await _provider_call(lambda: provider().schedules(airport, to))
    for row in rows:
        for name in ("sched_dep", "est_dep", "sched_arr", "est_arr"):
            row[name] = row[name].isoformat() if row[name] else None
    await redis().set(key, json.dumps(rows), ex=600)
    return rows


async def _arrivals(airport: str) -> list[dict]:
    """Flights heading to an airport, cached for ten minutes."""
    key = f"arr:{airport}"
    cached = await redis().get(key)
    if cached:
        return json.loads(cached)
    rows = await _provider_call(lambda: provider().arrivals(airport))
    for row in rows:
        for name in ("sched_dep", "est_dep", "sched_arr", "est_arr"):
            row[name] = row[name].isoformat() if row[name] else None
    await redis().set(key, json.dumps(rows), ex=600)
    return rows


@router.get("/flights/arrivals")
async def arrivals(airport: str, principal_id: str = Depends(passenger)) -> dict:
    """Flights flying to an airport and not yet landed, soonest landing first."""
    code = _code(airport)
    if not (3 <= len(code) <= 4 and code.isalnum()):
        raise HTTPException(400, "Use the airport's three-letter code.")
    held = await _arrivals(code)
    landing = lambda r: datetime.fromisoformat(r["est_arr"] or r["sched_arr"])
    rows = [r for r in held if r["status"] not in ("cancelled", "landed") and (r["est_arr"] or r["sched_arr"]) and landing(r) >= now()]
    rows.sort(key=lambda r: r["est_arr"] or r["sched_arr"])
    return {"flights": rows[:80], "truncated": len(held) >= 100, "window_hours": 10}


@router.get("/airports/search")
async def airport_search(q: str, principal_id: str = Depends(passenger)) -> list[dict]:
    """City or airport name to airports. Cached for a week: airports do not move."""
    query = q.strip().lower()
    if len(query) < 3:
        return []
    key = f"suggest:{query}"
    cached = await redis().get(key)
    if cached:
        return json.loads(cached)
    found = await _provider_call(lambda: provider().suggest(query))
    await redis().set(key, json.dumps(found), ex=7 * 24 * 3600)
    return found


@router.get("/flights/departures")
async def departures(airport: str, to: str | None = None, after: datetime | None = None, principal_id: str = Depends(passenger)) -> dict:
    """Flights from one airport to another over the next hours, soonest first, for picking a flight without its number."""
    code, dest = _code(airport), _code(to) if to else None
    for value in (code, dest):
        if value is not None and not (3 <= len(value) <= 4 and value.isalnum()):
            raise HTTPException(400, "Use the airport's three-letter code.")
    if after is None:
        earliest = now() - timedelta(minutes=30)
    else:
        earliest = after if after.tzinfo else after.replace(tzinfo=timezone.utc)
    held = await _departures(code, dest)
    rows = [r for r in held if r["status"] not in ("cancelled", "landed") and r["sched_dep"] and datetime.fromisoformat(r["est_dep"] or r["sched_dep"]) >= earliest]
    rows.sort(key=lambda r: r["est_dep"] or r["sched_dep"])
    # The provider caps a reply at 100 rows: a full reply means later flights may be missing.
    return {"flights": rows[:80], "truncated": len(held) >= 100, "window_hours": 10}


@router.post("/itineraries")
async def add_itinerary(body: ItineraryIn, request: Request, principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    consents = await privacy.active_consents(db, principal_id)
    if "tracking" not in consents:
        raise HTTPException(403, "Tracking consent is required.")
    inbound, outbound = await _resolve(db, body.inbound), await _resolve(db, body.outbound)
    await db.flush()
    if inbound.dest != outbound.origin:
        raise HTTPException(400, f"{inbound.flight_iata} lands at {inbound.dest} but {outbound.flight_iata} leaves from {outbound.origin}. They do not connect.")
    connection = (await db.execute(select(Connection).where(Connection.inbound_id == inbound.id, Connection.outbound_id == outbound.id))).scalar_one_or_none()
    if connection is None:
        connection = Connection(id=uid(), inbound_id=inbound.id, outbound_id=outbound.id, airport=inbound.dest)
        db.add(connection)
        await db.flush()
    # One trip per person: a new one replaces the old.
    old = list((await db.execute(select(Itinerary.id).where(Itinerary.principal_id == principal_id))).scalars())
    if old:
        await db.execute(delete(AssistanceNeed).where(AssistanceNeed.itinerary_id.in_(old)))
        await db.execute(delete(Itinerary).where(Itinerary.id.in_(old)))
    departure = outbound.est_dep or outbound.sched_dep
    departure = departure.replace(tzinfo=timezone.utc) if departure and departure.tzinfo is None else departure
    booking = body.booking or ("single_ticket" if inbound.flight_iata[:2] == outbound.flight_iata[:2] else "separate_tickets")
    itinerary = Itinerary(id=uid(), principal_id=principal_id, connection_id=connection.id, seat=_code(body.seat) if body.seat else None, booking=booking, expires_at=(departure or now()) + timedelta(hours=get_settings().retention_hours))
    db.add(itinerary)
    await db.flush()
    if body.assistance and body.assistance != "none":
        if "assistance" not in consents:
            raise HTTPException(403, "Allow use of your assistance need before declaring one.")
        db.add(AssistanceNeed(itinerary_id=itinerary.id, type_enc=encrypt(body.assistance)))
    await db.commit()
    await request.app.state.producer.send_and_wait(TOPIC_ITINERARY, key=inbound.id, value={"type": "itinerary.created", "event_id": uid(), "itinerary_id": itinerary.id, "connection_id": connection.id})
    return await connection_view(db, itinerary)


@router.get("/me/connection")
async def my_connection(principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    itinerary = (await db.execute(select(Itinerary).where(Itinerary.principal_id == principal_id).order_by(Itinerary.created_at.desc()).limit(1))).scalar_one_or_none()
    if itinerary is None:
        raise HTTPException(404, "No trip yet.")
    return await connection_view(db, itinerary)


@router.get("/me/feed")
async def my_feed(principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(FeedItem).where(FeedItem.principal_id == principal_id, FeedItem.audience == "pax").order_by(FeedItem.created_at.desc()).limit(50))).scalars()
    return [{"id": r.id, **r.payload, "created_at": r.created_at.isoformat()} for r in rows]


@router.get("/me/stream")
async def my_stream(principal_id: str = Depends(passenger)):
    return sse(f"live:pax:{principal_id}")


# ---- Rights of the person ----

@router.get("/me/data")
async def my_data(principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    db.add(RightsRequest(principal_id=principal_id, type="access", status="closed", closed_at=now()))
    await privacy.audit(db, principal_id, "passenger", "export", "own data")
    data = await privacy.export(db, principal_id)
    await db.commit()
    return data


@router.patch("/me/data")
async def correct(body: ProfileIn, principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    pii = await db.get(PassengerPII, principal_id)
    if pii is None:
        raise HTTPException(401, "Session no longer exists.")
    fields = body.model_dump(exclude_unset=True)
    if "name" in fields:
        pii.name_enc = encrypt(fields["name"])
    if "phone" in fields:
        pii.phone_enc = encrypt(fields["phone"])
    if fields.get("language") in ("en", "hi"):
        pii.language = fields["language"]
    db.add(RightsRequest(principal_id=principal_id, type="correction", status="closed", closed_at=now()))
    await db.commit()
    return await me_view(db, principal_id)


@router.post("/me/consent/withdraw")
async def withdraw(body: PurposeIn, request: Request, response: Response, principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    if body.purpose not in privacy.PURPOSES:
        raise HTTPException(400, "Unknown purpose.")
    if body.purpose == "tracking":
        # Tracking is the service itself: withdrawing it deletes everything.
        await _erase(request, response, principal_id, db, "withdrawal")
        return {"deleted": True}
    for consent in (await db.execute(select(Consent).where(Consent.principal_id == principal_id, Consent.purpose == body.purpose, Consent.withdrawn_at.is_(None)))).scalars():
        consent.withdrawn_at = now()
    if body.purpose == "assistance":
        await privacy.erase_assistance(db, principal_id)
    if body.purpose == "notifications":
        await db.execute(delete(FeedItem).where(FeedItem.principal_id == principal_id, FeedItem.audience == "pax"))
    if body.purpose == "authority_share":
        await db.execute(delete(FeedItem).where(FeedItem.principal_id == principal_id, FeedItem.audience == "authority"))
    db.add(RightsRequest(principal_id=principal_id, type="withdrawal", status="closed", closed_at=now()))
    await privacy.audit(db, principal_id, "passenger", "consent:withdrawn", body.purpose)
    await db.commit()
    for audience in ("crew", "ground", "authority"):
        await notify(audience)
    return await me_view(db, principal_id)


@router.post("/me/consent/grant")
async def grant(body: PurposeIn, principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    if body.purpose not in privacy.PURPOSES:
        raise HTTPException(400, "Unknown purpose.")
    if body.purpose not in await privacy.active_consents(db, principal_id):
        db.add(Consent(principal_id=principal_id, purpose=body.purpose, notice_version=get_settings().notice_version))
        await privacy.audit(db, principal_id, "passenger", "consent:given", body.purpose)
        await db.commit()
    return await me_view(db, principal_id)


@router.post("/me/grievance")
async def grievance(body: GrievanceIn, principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    request = RightsRequest(id=uid(), principal_id=principal_id, type="grievance", detail_enc=encrypt(body.message))
    db.add(request)
    await db.commit()
    return {"id": request.id, "status": request.status}


@router.post("/me/nominee")
async def nominee(body: NomineeIn, principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    request = RightsRequest(id=uid(), principal_id=principal_id, type="nominee", detail_enc=encrypt(f"{body.name} | {body.contact}"), status="closed", closed_at=now())
    db.add(request)
    await db.commit()
    return {"id": request.id, "status": request.status}


@router.get("/me/requests")
async def my_requests(principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(RightsRequest).where(RightsRequest.principal_id == principal_id).order_by(RightsRequest.opened_at.desc()))).scalars()
    return [{"id": r.id, "type": r.type, "status": r.status, "opened_at": r.opened_at.isoformat(), "closed_at": r.closed_at.isoformat() if r.closed_at else None} for r in rows]


async def _erase(request: Request, response: Response, principal_id: str, db: AsyncSession, reason: str) -> None:
    itinerary = (await db.execute(select(Itinerary).where(Itinerary.principal_id == principal_id))).scalars().first()
    await privacy.erase_principal(db, principal_id, actor=principal_id, reason=reason)
    await db.commit()
    clear_cookie(response, PAX_COOKIE)
    if itinerary:
        await request.app.state.producer.send_and_wait(TOPIC_ITINERARY, value={"type": "itinerary.withdrawn", "event_id": uid(), "connection_id": itinerary.connection_id})
    for audience in ("ops", "crew", "ground", "authority"):
        await notify(audience)


@router.delete("/me", status_code=204)
async def delete_me(request: Request, principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> Response:
    out = Response(status_code=204)
    await _erase(request, out, principal_id, db, "erasure")
    return out


# ---- Open the trip on another device ----
# The session is an anonymous cookie, so a second device has no way in. A short one-time code
# moves it across: no account, no email, nothing new stored about the person.
LINK_TTL_S = 600
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L


@router.post("/me/link")
async def make_link(principal_id: str = Depends(passenger), db: AsyncSession = Depends(get_db)) -> dict:
    code = "".join(secrets.choice(ALPHABET) for _ in range(8))
    await redis().set(f"link:{code}", principal_id, ex=LINK_TTL_S)
    await privacy.audit(db, principal_id, "passenger", "link:created", "one-time device code")
    await db.commit()
    return {"code": code, "expires_in": LINK_TTL_S}


@router.post("/session/claim")
async def claim(body: ClaimIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    # Slow down guessing: ten tries per address every ten minutes.
    address = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    tries = await redis().incr(f"claim:{address}")
    if tries == 1:
        await redis().expire(f"claim:{address}", LINK_TTL_S)
    if tries > 10:
        raise HTTPException(429, "Too many tries. Wait ten minutes and ask for a new code.")
    code = body.code.strip().upper().replace("-", "").replace(" ", "")
    principal_id = await redis().getdel(f"link:{code}")  # single use
    if not principal_id or await db.get(PassengerPII, principal_id) is None:
        raise HTTPException(404, "That code is wrong or has expired. Ask for a new one on your first device.")
    set_cookie(response, PAX_COOKIE, {"principal_id": principal_id})
    await privacy.audit(db, principal_id, "passenger", "link:claimed", "session opened on another device")
    await db.commit()
    return await me_view(db, principal_id)
