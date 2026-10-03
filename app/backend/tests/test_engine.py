"""The properties the design promises: cached risk, live decisions, idempotency, degraded mode, consent limits."""
from sqlalchemy import select

from segue.core import db
from segue.core.db import Connection, ConnectionRisk, Decision, FlightInstance, Outbox
from segue.engine.core import gate_for, process_connection
from tests.conftest import add_passenger, make_connection


async def run(connection_id, event_id, only=None):
    async with db.session() as s:
        result = await process_connection(s, connection_id, event_id, only)
        await s.commit()
        return result


async def rows(model, *where):
    async with db.session() as s:
        return list((await s.execute(select(model).where(*where))).scalars())


async def test_risk_is_computed_once_per_connection_version(stub):
    connection_id = await make_connection()
    await add_passenger(connection_id, "12A")
    await add_passenger(connection_id, "31C")
    first = await run(connection_id, "e1")
    second = await run(connection_id, "e2")
    assert stub.risk_calls == 1, "two passengers and two events on one version must cost one risk call"
    assert not first.risk_from_cache and second.risk_from_cache


async def test_new_flight_version_recomputes_risk(stub):
    connection_id = await make_connection()
    await add_passenger(connection_id)
    await run(connection_id, "e1")
    async with db.session() as s:
        connection = await s.get(Connection, connection_id)
        inbound = await s.get(FlightInstance, connection.inbound_id)
        inbound.version += 1
        await s.commit()
    result = await run(connection_id, "e2")
    assert stub.risk_calls == 2 and not result.risk_from_cache
    assert len(await rows(ConnectionRisk)) == 2


async def test_decisions_are_never_cached(stub):
    connection_id = await make_connection()
    await add_passenger(connection_id)
    await run(connection_id, "e1")
    await run(connection_id, "e2")
    assert stub.passenger_calls == 2 and stub.ops_calls == 2, "decisions are asked fresh on every event"


async def test_same_event_twice_creates_nothing_new(stub):
    connection_id = await make_connection()
    await add_passenger(connection_id)
    await run(connection_id, "e1")
    decisions, outbox = len(await rows(Decision)), len(await rows(Outbox))
    await run(connection_id, "e1")
    assert (len(await rows(Decision)), len(await rows(Outbox))) == (decisions, outbox)


async def test_unchanged_answer_is_not_resent(stub):
    connection_id = await make_connection()
    await add_passenger(connection_id)
    await run(connection_id, "e1")
    outbox = len(await rows(Outbox))
    await run(connection_id, "e2")  # a different event, the same answers
    assert len(await rows(Outbox)) == outbox, "only a change is news"


async def test_costly_actions_wait_for_a_person(stub):
    assert gate_for("hold_flight", "ops_action", 0.99) == "approval"
    assert gate_for("yes", "request_fast_track", 0.99) == "approval"
    assert gate_for("yes", "crew_priority_deplane", 0.95) == "auto"
    assert gate_for("yes", "crew_priority_deplane", 0.6) == "approval"
    assert gate_for("yes", "crew_priority_deplane", 0.3) == "human"
    connection_id = await make_connection()
    await add_passenger(connection_id, purposes=("tracking", "authority_share"))
    await run(connection_id, "e1")
    hold = (await rows(Decision, Decision.type == "ops_action"))[0]
    assert hold.status == "pending" and hold.gate == "approval"
    assert (await rows(Decision, Decision.type == "request_fast_track"))[0].status == "pending"
    assert not await rows(Outbox, Outbox.routing_key == "authority.fasttrack"), "nothing reaches the authority before ops approves"


async def test_model_down_means_rules_and_no_automation(stub):
    stub.fail = True
    connection_id = await make_connection(left_minutes=40)  # 40 - 20 gate close - 26 needed = -6
    await add_passenger(connection_id)
    result = await run(connection_id, "e1")
    assert result.degraded and result.risk["source"] == "rules" and result.risk["level"] == "at_risk"
    decisions = await rows(Decision)
    assert [d.type for d in decisions] == ["review"] and decisions[0].gate == "human"
    assert {o.routing_key for o in await rows(Outbox)} == {"ops.action"}, "nothing is automated in degraded mode"


async def test_model_recovery_replaces_the_rules_risk(stub):
    stub.fail = True
    connection_id = await make_connection()
    await add_passenger(connection_id)
    await run(connection_id, "e1")
    stub.fail = False
    result = await run(connection_id, "e2")
    assert result.risk["source"] == "model" and stub.risk_calls == 1


async def test_safe_passenger_costs_no_decision_call(stub):
    stub.level = "safe"
    connection_id = await make_connection(left_minutes=120)
    await add_passenger(connection_id)
    await run(connection_id, "e1")
    assert stub.passenger_calls == 0 and stub.ops_calls == 0
    assert [o.payload["template"] for o in await rows(Outbox)] == ["on_track"]


async def test_assistance_needs_consent_and_never_reaches_the_authority(stub):
    connection_id = await make_connection()
    await add_passenger(connection_id, "12A", purposes=("tracking", "assistance", "authority_share"), assistance="wheelchair")
    await add_passenger(connection_id, "14C", purposes=("tracking",), assistance="wheelchair")  # declared but not consented
    await run(connection_id, "e1")
    states = [s for s in stub.states if "declared_assistance" in s]
    assert sorted(s["declared_assistance"] for s in states) == ["none", "wheelchair"], "without consent the model never sees the need"
    crew = {d.payload["message"]["seat"]: d.payload["message"]["assistance"] for d in await rows(Decision, Decision.type == "crew_priority_deplane")}
    assert crew == {"12A": "wheelchair", "14C": None}
    fast = await rows(Decision, Decision.type == "request_fast_track")
    assert len(fast) == 1, "fast-track is requested only with the authority_share consent"
    assert "assistance" not in fast[0].payload["message"] and "seat" not in fast[0].payload["message"]


async def test_no_notification_consent_no_message(stub):
    connection_id = await make_connection()
    await add_passenger(connection_id, purposes=("tracking",))
    await run(connection_id, "e1")
    assert not await rows(Outbox, Outbox.routing_key == "pax.alert")


async def test_model_state_holds_no_identity(stub):
    connection_id = await make_connection()
    principal_id, itinerary_id = await add_passenger(connection_id, name="Priya Sharma")
    await run(connection_id, "e1")
    blob = repr(stub.states)
    assert "Priya" not in blob and principal_id not in blob and itinerary_id not in blob


async def test_booking_type_reaches_the_model_and_the_arithmetic(stub):
    stub.level = "safe"
    connection_id = await make_connection(left_minutes=80)  # 80 - 20 - 26 = 34: safe on one ticket
    await add_passenger(connection_id, "20A", booking="single_ticket")
    await add_passenger(connection_id, "20C", booking="separate_tickets")  # needs 35 more: buffer -1
    await run(connection_id, "e1")
    asked = [s for s in stub.states if "booking" in s]
    assert [s["booking"] for s in asked] == ["separate_tickets"], "only the self-transfer passenger is short of time"
    assert asked[0]["risk_level"] == "at_risk"


async def test_ops_counts_only_protected_passengers(stub):
    connection_id = await make_connection()
    await add_passenger(connection_id, "12A", booking="single_ticket")
    await add_passenger(connection_id, "14C", booking="separate_tickets")
    await add_passenger(connection_id, "15C", booking="separate_tickets")
    await run(connection_id, "e1")
    ops_state = next(s for s in stub.states if "protected_passengers" in s)
    assert (ops_state["protected_passengers"], ops_state["self_transfer_passengers"]) == (1, 2)


async def test_instruction_is_withdrawn_when_it_no_longer_applies(stub):
    connection_id = await make_connection()
    _, itinerary_id = await add_passenger(connection_id)
    await run(connection_id, "e1")
    assert [o.payload.get("retract") for o in await rows(Outbox, Outbox.routing_key == "crew.deplane")] == [None]

    async def changed_mind(state):  # the situation changed: the crew should no longer call this passenger first
        answers = await type(stub).ask_passenger(stub, state)
        answers["crew_priority_deplane"] = type(answers["crew_priority_deplane"])("no", 0.95, {})
        return answers

    stub_original, stub.ask_passenger = stub.ask_passenger, changed_mind
    await run(connection_id, "e2")
    crew = await rows(Outbox, Outbox.routing_key == "crew.deplane")
    assert [o.payload.get("retract") for o in crew] == [None, True], "the crew list is told to drop the passenger"
    latest = sorted(await rows(Decision, Decision.type == "crew_priority_deplane"), key=lambda d: d.created_at)[-1]
    assert latest.answer == "no"
    await run(connection_id, "e3")
    assert len(await rows(Outbox, Outbox.routing_key == "crew.deplane")) == 2, "a withdrawal is sent once"
