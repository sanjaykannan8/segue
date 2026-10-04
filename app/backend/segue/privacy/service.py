"""DPDP duties in code: consent checks, export, erasure, retention, and the audit trail."""
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.bus import redis
from ..core.db import AssistanceNeed, AuditLog, Consent, DataPrincipal, Decision, FeedItem, Itinerary, Outbox, PassengerPII, RightsRequest, now
from ..core.settings import get_settings
from ..core.util import decrypt

PURPOSES = {
    "tracking": ("Track my connection", "Use my two flights and seat to score my connection and show it to me and to the airline's operations team.", True),
    "notifications": ("Send me updates", "Show me alerts about my connection in this app, and email them to me if I give an address.", False),
    "assistance": ("Use my assistance need", "Use the assistance need I declare to arrange help. Shared only with operations, cabin crew and ground staff.", False),
    "authority_share": ("Ask the airport for fast-track", "Share my masked name, flights and connection deadline with the airport authority to request a faster lane. They decide.", False),
}


async def audit(db: AsyncSession, actor: str, role: str, action: str, obj: str) -> None:
    """Append-only record of every read of personal data and every staff action."""
    db.add(AuditLog(actor=actor, role=role, action=action, object=obj))


async def active_consents(db: AsyncSession, principal_id: str) -> set[str]:
    return set((await db.execute(select(Consent.purpose).where(Consent.principal_id == principal_id, Consent.withdrawn_at.is_(None)))).scalars())


async def export(db: AsyncSession, principal_id: str) -> dict:
    """Everything held on the person, decrypted, for the right of access."""
    pii = await db.get(PassengerPII, principal_id)
    consents = (await db.execute(select(Consent).where(Consent.principal_id == principal_id))).scalars()
    itineraries = list((await db.execute(select(Itinerary).where(Itinerary.principal_id == principal_id))).scalars())
    assistance = {}
    for itinerary in itineraries:
        need = await db.get(AssistanceNeed, itinerary.id)
        if need:
            assistance[itinerary.id] = decrypt(need.type_enc)
    decisions = (await db.execute(select(Decision).where(Decision.principal_id == principal_id))).scalars()
    feed = (await db.execute(select(FeedItem).where(FeedItem.principal_id == principal_id, FeedItem.audience == "pax"))).scalars()
    requests = (await db.execute(select(RightsRequest).where(RightsRequest.principal_id == principal_id))).scalars()
    iso = lambda v: v.isoformat() if v else None
    return {
        "principal_id": principal_id,
        "profile": {"name": decrypt(pii.name_enc) if pii else None, "phone": decrypt(pii.phone_enc) if pii else None, "email": decrypt(pii.email_enc) if pii else None, "language": pii.language if pii else None},
        "consents": [{"purpose": c.purpose, "notice_version": c.notice_version, "granted_at": iso(c.granted_at), "withdrawn_at": iso(c.withdrawn_at)} for c in consents],
        "itineraries": [{"id": i.id, "connection_id": i.connection_id, "seat": i.seat, "booking": i.booking, "created_at": iso(i.created_at), "delete_after": iso(i.expires_at), "assistance": assistance.get(i.id)} for i in itineraries],
        "decisions": [{"type": d.type, "answer": d.answer, "confidence": d.confidence, "gate": d.gate, "status": d.status, "created_at": iso(d.created_at)} for d in decisions],
        "messages": [{"title": f.payload.get("title"), "body": f.payload.get("body"), "created_at": iso(f.created_at)} for f in feed],
        "requests": [{"type": r.type, "status": r.status, "opened_at": iso(r.opened_at), "detail": decrypt(r.detail_enc)} for r in requests],
        "exported_at": iso(now()),
    }


async def erase_assistance(db: AsyncSession, principal_id: str) -> None:
    """Withdrawal of the `assistance` consent: the declared need and anything derived from it go."""
    ids = list((await db.execute(select(Itinerary.id).where(Itinerary.principal_id == principal_id))).scalars())
    if ids:
        await db.execute(delete(AssistanceNeed).where(AssistanceNeed.itinerary_id.in_(ids)))
    # Staff rows never hold the need itself (it is read from the encrypted table when a list is opened),
    # but a ground job may exist only because of it. Those jobs go now; the caller asks the engine to
    # score the passenger again, which re-issues whatever still applies without the need.
    connections = set((await db.execute(select(Itinerary.connection_id).where(Itinerary.principal_id == principal_id))).scalars())
    if ids:
        for item in (await db.execute(select(FeedItem).where(FeedItem.audience == "ground", FeedItem.connection_id.in_(connections)))).scalars():
            if (item.payload or {}).get("itinerary_id") in ids:
                await db.delete(item)
        await db.execute(update(Decision).where(Decision.principal_id == principal_id, Decision.type == "ground_dispatch", Decision.status == "pending").values(status="expired"))
        for row in (await db.execute(select(Outbox).where(Outbox.sent_at.is_(None), Outbox.routing_key == "ground.dispatch"))).scalars():
            if (row.payload or {}).get("itinerary_id") in ids:
                await db.delete(row)


async def erase_principal(db: AsyncSession, principal_id: str, actor: str, reason: str) -> None:
    """Erasure. Personal data is deleted; decisions stay as anonymous rows for analytics."""
    ids = list((await db.execute(select(Itinerary.id).where(Itinerary.principal_id == principal_id))).scalars())
    if ids:
        await db.execute(delete(AssistanceNeed).where(AssistanceNeed.itinerary_id.in_(ids)))
    await db.execute(delete(FeedItem).where(FeedItem.principal_id == principal_id))
    if ids:
        # Staff lists (crew, ground, authority) hold rows about the trip, keyed by itinerary: remove those too.
        connections = set((await db.execute(select(Itinerary.connection_id).where(Itinerary.principal_id == principal_id))).scalars())
        for item in (await db.execute(select(FeedItem).where(FeedItem.audience.in_(("crew", "ground", "authority")), FeedItem.connection_id.in_(connections)))).scalars():
            if (item.payload or {}).get("itinerary_id") in ids:
                await db.delete(item)
    # Messages not yet published are dropped; ones already in a queue are refused by the consumer, which finds no such person.
    for row in (await db.execute(select(Outbox).where(Outbox.sent_at.is_(None)))).scalars():
        if (row.payload or {}).get("principal_id") == principal_id or (row.payload or {}).get("itinerary_id") in ids:
            await db.delete(row)
    # Anything still waiting for a person can no longer be acted on: close it, then strip the identifiers.
    await db.execute(update(Decision).where(Decision.principal_id == principal_id, Decision.status == "pending").values(status="expired"))
    await db.execute(update(Decision).where(Decision.principal_id == principal_id).values(principal_id=None, itinerary_id=None, payload={}))
    await db.execute(delete(Itinerary).where(Itinerary.principal_id == principal_id))
    await db.execute(delete(PassengerPII).where(PassengerPII.principal_id == principal_id))
    await db.execute(delete(Consent).where(Consent.principal_id == principal_id))
    await db.execute(delete(RightsRequest).where(RightsRequest.principal_id == principal_id))
    await db.execute(delete(DataPrincipal).where(DataPrincipal.id == principal_id))
    await audit(db, actor, "system" if actor == "retention" else "passenger", f"erase:{reason}", "principal")
    try:
        # Any copy of the session token stops working now, not when it expires.
        await redis().set(f"gone:{principal_id}", "1", ex=get_settings().passenger_token_hours * 3600)
        await redis().delete(f"emailok:{principal_id}", f"emailcode:{principal_id}")
    except Exception:
        pass
