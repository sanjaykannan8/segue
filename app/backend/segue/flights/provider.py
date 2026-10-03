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


def normalize(data: dict, fallback_iata: str = "") -> dict:
    """AirLabs field names to ours. The flight and schedules endpoints share these fields."""
    sched_dep = _utc(data.get("dep_time_utc"))
    return {
        "flight_iata": (data.get("flight_iata") or fallback_iata).upper(),
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


class AirLabs:
    BASE = "https://airlabs.co/api/v9"

    async def _get(self, path: str, params: dict) -> dict:
        """One counted query, through the breaker. Only flight numbers, airport codes or a search word leave the system."""
        s = get_settings()
        if not s.airlabs_api_key:
            raise RuntimeError("AIRLABS_API_KEY is not set")
        if int(await redis().get(BUDGET_KEY) or 0) >= s.airlabs_budget:
            raise BudgetSpent("AirLabs query budget is spent")

        async def call() -> dict:
            async with httpx.AsyncClient(timeout=10.0) as http:
                response = await http.get(f"{self.BASE}/{path}", params={**params, "api_key": s.airlabs_api_key})
                await redis().incr(BUDGET_KEY)
                response.raise_for_status()
                return response.json()

        return await Breaker(redis(), "airlabs").call(call)

    async def fetch(self, flight_iata: str) -> dict | None:
        """Live status of one flight, or None when AirLabs has no such flight right now."""
        data = (await self._get("flight", {"flight_iata": flight_iata})).get("response")
        if not data or not data.get("dep_iata"):
            return None
        return normalize(data, flight_iata)

    async def suggest(self, query: str) -> list[dict]:
        """Airports matching a city or airport name."""
        response = (await self._get("suggest", {"q": query})).get("response") or {}
        seen, out = set(), []
        for group in ("airports", "airports_by_cities"):
            for airport in sorted(response.get(group) or [], key=lambda a: -(a.get("popularity") or 0)):
                code = airport.get("iata_code")
                if code and code not in seen:
                    seen.add(code)
                    out.append({"iata": code, "name": airport.get("name") or code, "country": airport.get("country_code")})
        return out[:8]

    async def arrivals(self, arr_iata: str) -> list[dict]:
        """Flights heading to an airport. The reply is capped at 100 rows, earliest first, which here
        means flights already in the air and landing over the next few hours."""
        rows = (await self._get("schedules", {"arr_iata": arr_iata})).get("response") or []
        return [{**normalize(row), "operated_by": row.get("cs_flight_iata")} for row in rows if row.get("flight_iata") and row.get("dep_iata") and row.get("dep_time_utc")]

    async def schedules(self, dep_iata: str, arr_iata: str | None = None) -> list[dict]:
        """Departures over the next ~10 hours. The plan caps a reply at 100 rows, earliest first, so a busy
        airport on its own returns mostly flights that have already left: pass the arrival airport too."""
        params = {"dep_iata": dep_iata, **({"arr_iata": arr_iata} if arr_iata else {})}
        rows = (await self._get("schedules", params)).get("response") or []
        out = []
        for row in rows:
            if not row.get("flight_iata") or not row.get("dep_iata") or not row.get("dep_time_utc"):
                continue
            out.append({**normalize(row), "operated_by": row.get("cs_flight_iata")})
        return out


def provider() -> FlightProvider:
    return AirLabs()
