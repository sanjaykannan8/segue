"""DPDP duties in code: consent checks, export, erasure, retention, and the audit trail."""
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.db import AssistanceNeed, AuditLog, Consent, DataPrincipal, Decision, FeedItem, Itinerary, PassengerPII, RightsRequest, now
from ..core.util import decrypt

PURPOSES = {
    "tracking": ("Track my connection", "Use my two flights and seat to score my connection and show it to me and to the airline's operations team.", True),
    "notifications": ("Send me updates", "Show me alerts about my connection in this app.", False),
    "assistance": ("Use my assistance need", "Use the assistance need I declare to arrange help. Shared only with operations, cabin crew and ground staff.", False),
    "authority_share": ("Ask the airport for fast-track", "Share my name, flights and connection deadline with the airport or immigration authority to request a faster lane. They decide.", False),
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
        "profile": {"name": decrypt(pii.name_enc) if pii else None, "phone": decrypt(pii.phone_enc) if pii else None, "language": pii.language if pii else None},
        "consents": [{"purpose": c.purpose, "notice_version": c.notice_version, "granted_at": iso(c.granted_at), "withdrawn_at": iso(c.withdrawn_at)} for c in consents],
        "itineraries": [{"id": i.id, "connection_id": i.connection_id, "seat": i.seat, "created_at": iso(i.created_at), "delete_after": iso(i.expires_at), "assistance": assistance.get(i.id)} for i in itineraries],
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
    for item in (await db.execute(select(FeedItem).where(FeedItem.principal_id == principal_id, FeedItem.audience.in_(("crew", "ground"))))).scalars():
        payload = dict(item.payload)
        payload["assistance"] = None
        item.payload = payload


async def erase_principal(db: AsyncSession, principal_id: str, actor: str, reason: str) -> None:
    """Erasure. Personal data is deleted; decisions stay as anonymous rows for analytics."""
    ids = list((await db.execute(select(Itinerary.id).where(Itinerary.principal_id == principal_id))).scalars())
    if ids:
        await db.execute(delete(AssistanceNeed).where(AssistanceNeed.itinerary_id.in_(ids)))
    await db.execute(delete(FeedItem).where(FeedItem.principal_id == principal_id))
    await db.execute(update(Decision).where(Decision.principal_id == principal_id).values(principal_id=None, itinerary_id=None, payload={}))
    await db.execute(delete(Itinerary).where(Itinerary.principal_id == principal_id))
    await db.execute(delete(PassengerPII).where(PassengerPII.principal_id == principal_id))
    await db.execute(delete(Consent).where(Consent.principal_id == principal_id))
    await db.execute(delete(RightsRequest).where(RightsRequest.principal_id == principal_id))
    await db.execute(delete(DataPrincipal).where(DataPrincipal.id == principal_id))
    await audit(db, actor, "system" if actor == "retention" else "passenger", f"erase:{reason}", "principal")
