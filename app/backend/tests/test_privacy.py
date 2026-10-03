from datetime import timedelta

from sqlalchemy import select

from segue.core import db
from segue.core.db import AssistanceNeed, AuditLog, Consent, DataPrincipal, Decision, FeedItem, Itinerary, PassengerPII, now
from segue.engine.core import process_connection
from segue.privacy.main import purge
from segue.privacy.service import erase_assistance, erase_principal, export
from tests.conftest import add_passenger, make_connection


async def count(model):
    async with db.session() as s:
        return len(list((await s.execute(select(model))).scalars()))


async def test_export_returns_everything_held(stub):
    connection_id = await make_connection()
    principal_id, _ = await add_passenger(connection_id, purposes=("tracking", "assistance"), assistance="wheelchair")
    async with db.session() as s:
        data = await export(s, principal_id)
    assert data["profile"]["name"] == "Priya Sharma"
    assert data["itineraries"][0]["assistance"] == "wheelchair" and data["itineraries"][0]["seat"] == "12A"
    assert {c["purpose"] for c in data["consents"]} == {"tracking", "assistance"}


async def test_erasure_deletes_personal_data_and_keeps_anonymous_decisions(stub):
    connection_id = await make_connection()
    principal_id, _ = await add_passenger(connection_id, purposes=("tracking", "notifications", "assistance"), assistance="wheelchair")
    async with db.session() as s:
        await process_connection(s, connection_id, "e1")
        await s.commit()
    assert await count(Decision) > 0
    async with db.session() as s:
        await erase_principal(s, principal_id, actor=principal_id, reason="erasure")
        await s.commit()
    for model in (DataPrincipal, PassengerPII, Consent, Itinerary, AssistanceNeed):
        assert await count(model) == 0, model.__name__
    async with db.session() as s:
        decisions = list((await s.execute(select(Decision))).scalars())
    assert decisions and all(d.principal_id is None and d.itinerary_id is None for d in decisions)
    # Passenger-level decisions lose their payload; the connection-level one never held personal data.
    assert all(d.payload == {} for d in decisions if d.type != "ops_action")
    assert await count(AuditLog) == 1


async def test_withdrawing_assistance_removes_it_everywhere(stub):
    connection_id = await make_connection()
    principal_id, itinerary_id = await add_passenger(connection_id, purposes=("tracking", "assistance"), assistance="wheelchair")
    async with db.session() as s:
        s.add(FeedItem(audience="crew", principal_id=principal_id, payload={"itinerary_id": itinerary_id, "assistance": "wheelchair"}))
        await s.commit()
    async with db.session() as s:
        await erase_assistance(s, principal_id)
        await s.commit()
    assert await count(AssistanceNeed) == 0
    async with db.session() as s:
        assert (await s.execute(select(FeedItem))).scalar_one().payload["assistance"] is None


async def test_retention_purges_after_the_window(stub):
    connection_id = await make_connection()
    kept, _ = await add_passenger(connection_id, "12A")
    _, gone_itinerary = await add_passenger(connection_id, "14C")
    async with db.session() as s:
        itinerary = await s.get(Itinerary, gone_itinerary)
        itinerary.expires_at = now() - timedelta(minutes=1)
        await s.commit()
    assert await purge() == 1
    async with db.session() as s:
        remaining = list((await s.execute(select(DataPrincipal.id))).scalars())
    assert remaining == [kept]


async def test_retention_purges_people_who_never_added_a_trip(stub):
    async with db.session() as s:
        old = DataPrincipal(id="old", created_at=now() - timedelta(hours=30))
        fresh = DataPrincipal(id="fresh")
        s.add_all([old, fresh])
        await s.flush()
        s.add(PassengerPII(principal_id="old", language="en"))
        await s.commit()
    assert await purge() == 1
    async with db.session() as s:
        assert list((await s.execute(select(DataPrincipal.id))).scalars()) == ["fresh"]
    assert await count(PassengerPII) == 0


async def test_erasure_removes_the_passenger_from_staff_lists(stub):
    connection_id = await make_connection()
    gone, gone_itinerary = await add_passenger(connection_id, "12A")
    _, kept_itinerary = await add_passenger(connection_id, "14C")
    async with db.session() as s:
        s.add(FeedItem(audience="crew", payload={"itinerary_id": gone_itinerary, "seat": "12A"}))
        s.add(FeedItem(audience="ground", payload={"itinerary_id": gone_itinerary, "seat": "12A"}))
        s.add(FeedItem(audience="crew", payload={"itinerary_id": kept_itinerary, "seat": "14C"}))
        await s.commit()
    async with db.session() as s:
        await erase_principal(s, gone, actor=gone, reason="erasure")
        await s.commit()
    async with db.session() as s:
        left = [(f.audience, f.payload["seat"]) for f in (await s.execute(select(FeedItem))).scalars()]
    assert left == [("crew", "14C")]
