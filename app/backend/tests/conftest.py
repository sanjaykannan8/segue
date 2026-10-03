"""Tests run without Docker: SQLite in a temp file, a fake Redis, and a stubbed model."""
import os
from datetime import timedelta

import pytest
from cryptography.fernet import Fernet

os.environ.setdefault("PII_KEY", Fernet.generate_key().decode())
os.environ.setdefault("SESSION_SECRET", "test")
os.environ.setdefault("AIRPORTS_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "config", "airports"))

import fakeredis.aioredis  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from segue.core import bus, db  # noqa: E402
from segue.core.db import AssistanceNeed, Base, Connection, Consent, DataPrincipal, FlightInstance, Itinerary, PassengerPII, now, uid  # noqa: E402
from segue.core.util import encrypt  # noqa: E402
from segue.model.client import Answer  # noqa: E402


@pytest.fixture(autouse=True)
async def services(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(db, "_engine", engine)
    monkeypatch.setattr(db, "_maker", async_sessionmaker(engine, expire_on_commit=False))
    monkeypatch.setattr(bus, "_redis", fakeredis.aioredis.FakeRedis(decode_responses=True))
    yield
    await engine.dispose()


class StubModel:
    """Stands in for clef-flash and counts the calls, so tests can prove what is and is not cached."""

    def __init__(self):
        self.risk_calls = self.ops_calls = self.passenger_calls = 0
        self.fail = False
        self.level = "at_risk"
        self.states: list[dict] = []

    async def ask_risk(self, state):
        if self.fail:
            raise TimeoutError("model down")
        self.risk_calls += 1
        self.states.append(state)
        return Answer(self.level, 0.9, {self.level: 0.9})

    async def ask_ops(self, state):
        if self.fail:
            raise TimeoutError("model down")
        self.ops_calls += 1
        self.states.append(state)
        return Answer("hold_flight", 0.95, {"hold_flight": 0.95})

    async def ask_passenger(self, state):
        if self.fail:
            raise TimeoutError("model down")
        self.passenger_calls += 1
        self.states.append(state)
        declared = state["declared_assistance"] != "none"
        return {
            "needs_assistance": Answer("yes" if declared else "no", 0.95, {}),
            "assistance_type": Answer(state["declared_assistance"] if declared else "none", 0.95, {}),
            "crew_priority_deplane": Answer("yes", 0.95, {}),
            "ground_dispatch": Answer("buggy", 0.9, {}),
            "request_fast_track": Answer("yes", 0.9, {}),
            "message_template": Answer("called_off_first", 0.9, {}),
        }


@pytest.fixture
def stub(monkeypatch):
    from segue.engine import core

    model = StubModel()
    monkeypatch.setattr(core, "model", model)
    return model


async def make_connection(left_minutes: int = 40) -> str:
    """EK 512 into DXB and BA 108 out, `left_minutes` between landing and departure."""
    async with db.session() as s:
        arrival = now() + timedelta(hours=2)
        inbound = FlightInstance(id=uid(), flight_iata="EK512", date="2026-10-03", origin="DEL", dest="DXB", sched_arr=arrival, est_arr=arrival, sched_dep=arrival - timedelta(hours=3), est_dep=arrival - timedelta(hours=3), arr_terminal="3", overrides={})
        departure = arrival + timedelta(minutes=left_minutes)
        outbound = FlightInstance(id=uid(), flight_iata="BA108", date="2026-10-03", origin="DXB", dest="LHR", sched_dep=departure, est_dep=departure, sched_arr=departure + timedelta(hours=7), est_arr=departure + timedelta(hours=7), dep_terminal="3", dep_gate="B14", overrides={})
        connection = Connection(id=uid(), inbound_id=inbound.id, outbound_id=outbound.id, airport="DXB")
        s.add_all([inbound, outbound])
        await s.flush()
        s.add(connection)
        await s.commit()
        return connection.id


async def add_passenger(connection_id: str, seat: str = "12A", purposes=("tracking", "notifications"), assistance: str | None = None, name: str = "Priya Sharma", booking: str = "single_ticket") -> tuple[str, str]:
    async with db.session() as s:
        principal = DataPrincipal(id=uid())
        s.add(principal)
        await s.flush()
        s.add(PassengerPII(principal_id=principal.id, name_enc=encrypt(name), language="en"))
        for purpose in purposes:
            s.add(Consent(principal_id=principal.id, purpose=purpose, notice_version="t"))
        itinerary = Itinerary(id=uid(), principal_id=principal.id, connection_id=connection_id, seat=seat, booking=booking, expires_at=now() + timedelta(hours=30))
        s.add(itinerary)
        await s.flush()
        if assistance:
            s.add(AssistanceNeed(itinerary_id=itinerary.id, type_enc=encrypt(assistance)))
        await s.commit()
        return principal.id, itinerary.id
