"""Sessions, role checks and server-sent events."""
import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.bus import redis
from ..core.db import session
from ..core.settings import get_settings

PAX_COOKIE, STAFF_COOKIE = "segue_pax", "segue_staff"
MAX_AGE = 3 * 24 * 3600


def _signer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt="segue-session")


async def get_db() -> AsyncIterator[AsyncSession]:
    async with session() as db:
        yield db


def set_cookie(response: Response, name: str, value: dict) -> None:
    # httpOnly so page scripts cannot read it. `secure` should be on once the site is served over HTTPS.
    response.set_cookie(name, _signer().dumps(value), max_age=MAX_AGE, httponly=True, samesite="lax", secure=False, path="/")


def clear_cookie(response: Response, name: str) -> None:
    response.delete_cookie(name, path="/")


def _read(request: Request, name: str) -> dict | None:
    token = request.cookies.get(name)
    if not token:
        return None
    try:
        return _signer().loads(token, max_age=MAX_AGE)
    except BadSignature:
        return None


def passenger(request: Request) -> str:
    data = _read(request, PAX_COOKIE)
    if not data:
        raise HTTPException(401, "No session. Give consent first.")
    return data["principal_id"]


def staff(*roles: str):
    """Role-based access: each staff route names the roles that may use it. `admin` may use all."""
    def check(request: Request) -> dict:
        data = _read(request, STAFF_COOKIE)
        if not data:
            raise HTTPException(401, "Not logged in.")
        if roles and data["role"] != "admin" and data["role"] not in roles:
            raise HTTPException(403, "Your role cannot use this.")
        return data
    return Depends(check)


def sse(channel: str) -> StreamingResponse:
    """Stream a Redis pub/sub channel to the browser, with a heartbeat so proxies keep it open."""
    async def stream() -> AsyncIterator[str]:
        pubsub = redis().pubsub()
        await pubsub.subscribe(channel)
        try:
            yield ": connected\n\n"
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15)
                if message is None:
                    yield ": keep-alive\n\n"
                    continue
                body = json.loads(message["data"])
                yield f"event: {body['event']}\ndata: {json.dumps(body['data'])}\n\n"
                await asyncio.sleep(0)
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
