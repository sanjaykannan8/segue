import asyncio
from datetime import timedelta

import pytest

from segue.core import buffer as buf
from segue.core.breaker import Breaker, BreakerOpen
from segue.core.bus import redis
from segue.core.db import now
from segue.core.util import decrypt, encrypt, hash_password, idempotency_key, mask_name, risk_cache_key, verify_password


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
    assert buf.passenger_offset("DXB", base, "20A", None, "separate_tickets") == 35  # collect and re-check the bag


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


def test_names_are_masked_for_staff():
    assert mask_name("Priya Sharma") == "P***a S***a"
    assert mask_name("Li") == "L***" and mask_name("Ali") == "A***" and mask_name("A") == "A***" and mask_name(None) is None
    assert "riy" not in mask_name("Priya Sharma")


def test_real_dxb_layout():
    """The shipped DXB file: gates map to concourses, and each pair has a transfer time with its provenance."""
    from pathlib import Path

    import yaml

    config = {**buf.DEFAULT, **yaml.safe_load((Path(__file__).parents[2] / "config" / "airports" / "DXB.yaml").read_text(encoding="utf-8"))}
    assert buf.concourse(config, "C22", "3") == "C" and buf.concourse(config, None, "1") == "D" and buf.concourse(config, None, "3") is None
    a_to_b = buf.transfer(config, "3", "3", "A12", "B14")
    assert (a_to_b.minutes, a_to_b.sourced, a_to_b.origin, a_to_b.destination) == (30, True, "A", "B")
    assert buf.transfer(config, "3", "3", "B14", "A12").minutes == 30, "same in both directions"
    assert buf.transfer(config, "3", "3", "B7", "B30").minutes == 10
    to_t2 = buf.transfer(config, "3", "2", "C10", "F4")
    assert (to_t2.minutes, to_t2.sourced) == (60, False) and "Terminal 2" in to_t2.how
    assert buf.transfer(config, "3", "1", "B5", None).destination == "D", "Terminal 1 has one concourse"
    assert buf.transfer(config, "3", "3", None, "B14").minutes == 30, "gate not yet known: assume another concourse"
    pairs = [f"{x}-{y}" for i, x in enumerate("ABCDF") for y in "ABCDF"[i:]]
    assert sorted(config["transfer"]) == sorted(pairs), "every concourse pair has a value"
    assert sum(1 for entry in config["transfer"].values() if entry["sourced"]) == 3


def test_password_hashes_store_their_cost_and_old_ones_still_verify():
    import hashlib, os
    from base64 import b64encode
    from segue.core.util import needs_rehash
    new = hash_password("correct horse")
    assert new.startswith("17$") and verify_password("correct horse", new) and not verify_password("wrong", new) and not needs_rehash(new)
    salt = os.urandom(16)
    old = b64encode(salt).decode() + "$" + b64encode(hashlib.scrypt(b"correct horse", salt=salt, n=2**14, r=8, p=1)).decode()
    assert verify_password("correct horse", old) and needs_rehash(old)
