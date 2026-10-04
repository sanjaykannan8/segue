"""Circuit breaker with its state in Redis, so every service and the console see the same thing.

closed    -> calls go through; consecutive failures are counted
open      -> calls are skipped at once (BreakerOpen) until the cool-down ends
half_open -> after the cool-down one trial call is let through; success closes, failure re-opens

The console can force a breaker open or closed (`forced`), or return it to automatic.
"""
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

from redis.asyncio import Redis

T = TypeVar("T")
NAMES = ("model", "airlabs", "rabbit", "mail")


class BreakerOpen(Exception):
    pass


class Breaker:
    def __init__(self, redis: Redis, name: str, threshold: int = 3, cooldown_s: float = 20.0):
        self.redis, self.name, self.threshold, self.cooldown_s = redis, name, threshold, cooldown_s
        self.key = f"breaker:{name}"

    async def snapshot(self) -> dict:
        raw = await self.redis.hgetall(self.key)
        failures = int(raw.get("failures", 0))
        opened_at = float(raw.get("opened_at", 0))
        forced = raw.get("forced") or None
        if forced in ("open", "closed"):
            state = forced
        elif opened_at and time.time() - opened_at < self.cooldown_s:
            state = "open"
        elif opened_at:
            state = "half_open"
        else:
            state = "closed"
        return {"name": self.name, "state": state, "failures": failures, "forced": forced}

    async def is_open(self) -> bool:
        return (await self.snapshot())["state"] == "open"

    async def force(self, state: str) -> None:
        if state == "auto":
            await self.redis.hdel(self.key, "forced")
            await self.redis.hset(self.key, mapping={"failures": 0, "opened_at": 0})
        else:
            await self.redis.hset(self.key, "forced", state)

    async def _success(self) -> None:
        await self.redis.hset(self.key, mapping={"failures": 0, "opened_at": 0})

    async def _failure(self) -> None:
        failures = await self.redis.hincrby(self.key, "failures", 1)
        snap = await self.snapshot()
        if failures >= self.threshold or snap["state"] == "half_open":
            await self.redis.hset(self.key, "opened_at", time.time())

    async def call(self, fn: Callable[[], Awaitable[T]]) -> T:
        if await self.is_open():
            raise BreakerOpen(self.name)
        try:
            result = await fn()
        except Exception:
            await self._failure()
            raise
        await self._success()
        return result
