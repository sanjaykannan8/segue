"""Tables. Personal data lives in its own encrypted tables; everything else uses pseudonymous IDs."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Float
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .settings import get_settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def uid() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


TS = DateTime(timezone=True)


class DataPrincipal(Base):
    __tablename__ = "data_principal"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)


class PassengerPII(Base):
    """Encrypted at application level (core.crypto). Read only by passenger, privacy and authority routes."""
    __tablename__ = "passenger_pii"
    principal_id: Mapped[str] = mapped_column(ForeignKey("data_principal.id", ondelete="CASCADE"), primary_key=True)
    name_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(8), default="en")


class Consent(Base):
    __tablename__ = "consent"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    principal_id: Mapped[str] = mapped_column(ForeignKey("data_principal.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(32))
    notice_version: Mapped[str] = mapped_column(String(32))
    granted_at: Mapped[datetime] = mapped_column(TS, default=now)
    withdrawn_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class FlightInstance(Base):
    __tablename__ = "flight_instance"
    __table_args__ = (UniqueConstraint("flight_iata", "date"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    flight_iata: Mapped[str] = mapped_column(String(10), index=True)
    date: Mapped[str] = mapped_column(String(10))
    origin: Mapped[str] = mapped_column(String(4))
    dest: Mapped[str] = mapped_column(String(4))
    sched_dep: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    est_dep: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    sched_arr: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    est_arr: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    dep_terminal: Mapped[str | None] = mapped_column(String(8), nullable=True)
    dep_gate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    arr_terminal: Mapped[str | None] = mapped_column(String(8), nullable=True)
    arr_gate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="scheduled")
    source: Mapped[str] = mapped_column(String(8), default="airlabs")
    # Fields set by hand on the console; the poller does not overwrite them.
    overrides: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(TS, default=now)
    polled_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class Connection(Base):
    __tablename__ = "connection"
    __table_args__ = (UniqueConstraint("inbound_id", "outbound_id"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    inbound_id: Mapped[str] = mapped_column(ForeignKey("flight_instance.id"), index=True)
    outbound_id: Mapped[str] = mapped_column(ForeignKey("flight_instance.id"), index=True)
    airport: Mapped[str] = mapped_column(String(4))


class ConnectionRisk(Base):
    """Durable copy of the cached risk: one row per connection per data version."""
    __tablename__ = "connection_risk"
    connection_id: Mapped[str] = mapped_column(ForeignKey("connection.id", ondelete="CASCADE"), primary_key=True)
    version: Mapped[str] = mapped_column(String(32), primary_key=True)
    left_min: Mapped[int] = mapped_column(Integer)
    needed_min: Mapped[int] = mapped_column(Integer)
    buffer_min: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(16))
    probabilities: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String(8), default="model")
    computed_at: Mapped[datetime] = mapped_column(TS, default=now)


class Itinerary(Base):
    __tablename__ = "itinerary"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    principal_id: Mapped[str] = mapped_column(ForeignKey("data_principal.id", ondelete="CASCADE"), index=True)
    connection_id: Mapped[str] = mapped_column(ForeignKey("connection.id"), index=True)
    seat: Mapped[str | None] = mapped_column(String(6), nullable=True)
    # single_ticket: both flights on one booking, the airline protects the connection.
    # separate_tickets: the passenger booked them apart (self-transfer): bags are re-checked, no rebooking is owed.
    booking: Mapped[str] = mapped_column(String(20), default="single_ticket", server_default="single_ticket")
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    expires_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class AssistanceNeed(Base):
    """Declared by the passenger, stored only with the `assistance` consent. Encrypted."""
    __tablename__ = "assistance_need"
    itinerary_id: Mapped[str] = mapped_column(ForeignKey("itinerary.id", ondelete="CASCADE"), primary_key=True)
    type_enc: Mapped[str] = mapped_column(Text)
    declared_at: Mapped[datetime] = mapped_column(TS, default=now)


class Decision(Base):
    """Never cached. The idempotency key makes a redelivered event a no-op."""
    __tablename__ = "decision"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    connection_id: Mapped[str] = mapped_column(ForeignKey("connection.id", ondelete="CASCADE"), index=True)
    itinerary_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    principal_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(32))
    answer: Mapped[str] = mapped_column(String(32))
    probabilities: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    gate: Mapped[str] = mapped_column(String(12))  # auto | approval | human
    status: Mapped[str] = mapped_column(String(12), default="pending")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)  # what gets published once it may run
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    decided_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Outbox(Base):
    """Written in the same transaction as the decision; the relay publishes it."""
    __tablename__ = "outbox"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[str] = mapped_column(String(128), unique=True)
    routing_key: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    sent_at: Mapped[datetime | None] = mapped_column(TS, nullable=True, index=True)


class ProcessedMessage(Base):
    """Inbox: a consumer that sees a message id twice drops the second."""
    __tablename__ = "processed_message"
    consumer: Mapped[str] = mapped_column(String(32), primary_key=True)
    message_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    at: Mapped[datetime] = mapped_column(TS, default=now)


class FeedItem(Base):
    __tablename__ = "feed_item"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    audience: Mapped[str] = mapped_column(String(16), index=True)  # pax | ops | crew | ground | authority
    principal_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    connection_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    decision_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(12), default="open")
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    expires_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class StaffUser(Base):
    __tablename__ = "staff_user"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(128), unique=True)
    role: Mapped[str] = mapped_column(String(16))
    password_hash: Mapped[str] = mapped_column(Text)


class AuditLog(Base):
    """Append-only. Records every read of personal or assistance data and every staff action."""
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(TS, default=now, index=True)
    actor: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(48))
    object: Mapped[str] = mapped_column(String(128))


class RightsRequest(Base):
    __tablename__ = "rights_request"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    principal_id: Mapped[str] = mapped_column(String(32), index=True)
    type: Mapped[str] = mapped_column(String(16))  # access | correction | erasure | grievance | nominee | withdrawal
    detail_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="open")
    opened_at: Mapped[datetime] = mapped_column(TS, default=now)
    closed_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class DeadEvent(Base):
    """Events that failed processing after bounded retries (also published to engine.dlq)."""
    __tablename__ = "dead_event"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    topic: Mapped[str] = mapped_column(String(48))
    key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON)
    error: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)


_engine = None
_maker = None


def engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    return _engine


def session() -> AsyncSession:
    global _maker
    if _maker is None:
        _maker = async_sessionmaker(engine(), expire_on_commit=False)
    return _maker()
