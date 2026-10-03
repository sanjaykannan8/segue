"""Flight status behind one interface. AirLabs is the provider; the key has a small query allowance,
so every call is counted and a hard ceiling stops the poller before the plan runs out."""
from datetime import datetime, timezone
from typing import Protocol

import httpx

from ..core.breaker import Breaker
from ..core.bus import redis
from ..core.settings import get_settings

BUDGET_KEY = "airlabs:used"


class BudgetSpent(Exception):
    pass


class FlightProvider(Protocol):
    async def fetch(self, flight_iata: str) -> dict | None: ...


def _utc(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)


async def budget() -> dict:
    return {"used": int(await redis().get(BUDGET_KEY) or 0), "budget": get_settings().airlabs_budget}


class AirLabs:
    URL = "https://airlabs.co/api/v9/flight"

    async def fetch(self, flight_iata: str) -> dict | None:
        """One query. Returns normalized fields, or None when AirLabs has no such flight right now."""
        s = get_settings()
        if not s.airlabs_api_key:
            raise RuntimeError("AIRLABS_API_KEY is not set")
        if int(await redis().get(BUDGET_KEY) or 0) >= s.airlabs_budget:
            raise BudgetSpent("AirLabs query budget is spent")

        async def call() -> dict:
            async with httpx.AsyncClient(timeout=8.0) as http:
                # Only the flight number leaves the system: no passenger data.
                response = await http.get(self.URL, params={"flight_iata": flight_iata, "api_key": s.airlabs_api_key})
                await redis().incr(BUDGET_KEY)
                response.raise_for_status()
                return response.json()

        body = await Breaker(redis(), "airlabs").call(call)
        data = body.get("response")
        if not data or not data.get("dep_iata"):
            return None
        sched_dep = _utc(data.get("dep_time_utc"))
        return {
            "flight_iata": (data.get("flight_iata") or flight_iata).upper(),
            "date": (sched_dep or datetime.now(timezone.utc)).strftime("%Y-%m-%d"),
            "origin": data["dep_iata"],
            "dest": data.get("arr_iata") or "",
            "sched_dep": sched_dep,
            "est_dep": _utc(data.get("dep_estimated_utc")) or sched_dep,
            "sched_arr": _utc(data.get("arr_time_utc")),
            "est_arr": _utc(data.get("arr_estimated_utc")) or _utc(data.get("arr_time_utc")),
            "dep_terminal": data.get("dep_terminal"),
            "dep_gate": data.get("dep_gate"),
            "arr_terminal": data.get("arr_terminal"),
            "arr_gate": data.get("arr_gate"),
            "status": data.get("status") or "scheduled",
        }


def provider() -> FlightProvider:
    return AirLabs()
