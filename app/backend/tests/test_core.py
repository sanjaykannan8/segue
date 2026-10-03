import asyncio
from datetime import timedelta

import pytest

from segue.core import buffer as buf
from segue.core.breaker import Breaker, BreakerOpen
from segue.core.bus import redis
from segue.core.db import now
from segue.core.util import decrypt, encrypt, hash_password, idempotency_key, risk_cache_key, verify_password


def test_buffer_arithmetic_is_exact():
    arrival = now()
    base = buf.connection_buffer("DXB", arrival, arrival + timedelta(minutes=75), "3", "3")
    # DXB.yaml: the gate closes 20 min before; deplane 8 + walk 12 + queue 6 = 26 needed.
    assert (base.left_min, base.needed_min, base.buffer_min) == (55, 26, 29)
    late = buf.connection_buffer("DXB", arrival + timedelta(minutes=25), arrival + timedelta(minutes=75), "3", "3")
    assert late.buffer_min == 4


def test_terminal_change_and_unknown_airport():
    arrival = now()
    assert buf.connection_buffer("DXB", arrival, arrival + timedelta(minutes=90), "3", "1").needed_min == 8 + 30 + 6
    assert buf.connection_buffer("ZZZ", arrival, arrival + timedelta(minutes=90), None, None).needed_min == 8 + 10 + 8


def test_passenger_offset():
    arrival = now()
    base = buf.connection_buffer("DXB", arrival, arrival + timedelta(minutes=75), "3", "3")
    assert buf.passenger_offset("DXB", base, "20A", None) == 0
    assert buf.passenger_offset("DXB", base, "45K", None) == 5  # 25 rows back, 12 s each
    assert buf.passenger_offset("DXB", base, "5A", None) == -3  # near the door: time back
    assert buf.passenger_offset("DXB", base, "20A", "wheelchair") == 6  # walk 12 min x 1.5


def test_rule_levels():
    assert [buf.rule_level(b) for b in (30, 20, 10, 5, 0, -15, -16)] == ["safe", "safe", "tight", "tight", "at_risk", "at_risk", "lost"]


def test_keys_and_crypto():
    assert risk_cache_key("c1", "3.1") != risk_cache_key("c1", "4.1")
    assert idempotency_key("c", "i", "t", "e") == idempotency_key("c", "i", "t", "e")
    assert idempotency_key("c", "i", "t", "e1") != idempotency_key("c", "i", "t", "e2")
    # Postgres enforces the 128-character column; the longest routing key must still fit.
    from segue.core.bus import QUEUES
    key = idempotency_key("a" * 32, "b" * 32, "request_fast_track", "c" * 32)
    assert all(len(f"{key}:{routing_key}") <= 128 for routing_key in QUEUES)
    token = encrypt("Priya Sharma")
    assert "Priya" not in token and decrypt(token) == "Priya Sharma"
    assert encrypt(None) is None and decrypt(None) is None
    stored = hash_password("s3cret")
    assert verify_password("s3cret", stored) and not verify_password("wrong", stored)


async def test_breaker_opens_then_recovers():
    breaker = Breaker(redis(), "model", threshold=2, cooldown_s=0.05)

    async def boom():
        raise TimeoutError()

    async def fine():
        return "ok"

    for _ in range(2):
        with pytest.raises(TimeoutError):
            await breaker.call(boom)
    assert (await breaker.snapshot())["state"] == "open"
    with pytest.raises(BreakerOpen):
        await breaker.call(fine)  # skipped at once while open
    await asyncio.sleep(0.06)
    assert (await breaker.snapshot())["state"] == "half_open"
    assert await breaker.call(fine) == "ok"
    assert (await breaker.snapshot())["state"] == "closed"


async def test_breaker_can_be_forced_from_the_console():
    breaker = Breaker(redis(), "model")
    await breaker.force("open")
    assert await breaker.is_open()
    await breaker.force("auto")
    assert (await breaker.snapshot())["state"] == "closed"
