"""Authentication and authorisation: JWTs with a role claim, in httpOnly cookies.

  passenger  one access token for the length of a trip (no account, no password)
  staff      a 15-minute access token plus a rotating refresh token

Why cookies and not browser storage: an httpOnly cookie cannot be read by page scripts, so a
script-injection bug cannot steal the token. SameSite=Lax plus a same-origin API (the web app
proxies /api) covers cross-site request forgery.

Every staff route names the roles allowed to use it (`staff("ops")`). The role comes from the
signed token, never from the request.
"""
import asyncio
import ipaddress
import json
import time
from collections.abc import AsyncIterator

import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.bus import redis
from ..core.db import StaffUser, session, uid
from ..core.settings import get_settings

PAX_COOKIE, STAFF_COOKIE, REFRESH_COOKIE = "segue_pax", "segue_staff", "segue_refresh"
ALGORITHM = "HS256"
ROLES = ("ops", "crew", "ground", "authority", "admin")


async def get_db() -> AsyncIterator[AsyncSession]:
    async with session() as db:
        yield db


# ---- tokens ----

def _encode(claims: dict, ttl_s: int) -> str:
    issued = int(time.time())
    return jwt.encode({**claims, "iat": issued, "exp": issued + ttl_s, "jti": uid(), "iss": "segue"}, get_settings().jwt_secret, algorithm=ALGORITHM)


def _decode(token: str | None, kind: str) -> dict | None:
    """Verify signature, expiry, issuer and token kind. Returns None for anything that does not check out."""
    if not token:
        return None
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM], issuer="segue", options={"require": ["exp", "iat", "sub", "jti"], "enforce_minimum_key_length": True})
    except jwt.PyJWTError:
        return None
    return claims if claims.get("typ") == kind else None


def _set(response: Response, name: str, token: str, max_age: int) -> None:
    response.set_cookie(name, token, max_age=max_age, httponly=True, samesite="lax", secure=get_settings().cookie_secure, path="/")


def clear_cookie(response: Response, name: str) -> None:
    response.delete_cookie(name, path="/")


def issue_passenger(response: Response, principal_id: str) -> None:
    ttl = get_settings().passenger_token_hours * 3600
    _set(response, PAX_COOKIE, _encode({"sub": principal_id, "role": "passenger", "typ": "pax"}, ttl), ttl)


async def session_version(user_id: str) -> int:
    """Every token carries the version it was issued under. Raising the number ends all of that
    person's sessions at once: sign out everywhere, a password change, a stolen refresh token."""
    return int(await redis().get(f"sv:{user_id}") or 0)


async def end_all_sessions(user_id: str) -> None:
    await redis().incr(f"sv:{user_id}")


async def issue_staff(response: Response, user: StaffUser) -> None:
    s = get_settings()
    access_ttl, refresh_ttl = s.access_token_minutes * 60, s.refresh_token_hours * 3600
    version = await session_version(user.id)
    _set(response, STAFF_COOKIE, _encode({"sub": user.id, "email": user.email, "role": user.role, "typ": "access", "sv": version}, access_ttl), access_ttl)
    refresh = _encode({"sub": user.id, "typ": "refresh", "sv": version}, refresh_ttl)
    # The refresh token is single use: its id must still be on record when it comes back.
    await redis().set(f"refresh:{jwt.decode(refresh, options={'verify_signature': False})['jti']}", user.id, ex=refresh_ttl)
    _set(response, REFRESH_COOKIE, refresh, refresh_ttl)


async def revoke_staff(request: Request, response: Response) -> None:
    """Logout: the refresh token is forgotten and the access token is refused for the rest of its life."""
    access = _decode(request.cookies.get(STAFF_COOKIE), "access")
    if access:
        await redis().set(f"denied:{access['jti']}", "1", ex=max(1, access["exp"] - int(time.time())))
    refresh = _decode(request.cookies.get(REFRESH_COOKIE), "refresh")
    if refresh:
        await redis().delete(f"refresh:{refresh['jti']}")
        await redis().set(f"loggedout:{refresh['jti']}", "1", ex=max(1, refresh["exp"] - int(time.time())))
    clear_cookie(response, STAFF_COOKIE)
    clear_cookie(response, REFRESH_COOKIE)


# ---- dependencies ----

async def passenger(request: Request) -> str:
    claims = _decode(request.cookies.get(PAX_COOKIE), "pax")
    if not claims or claims.get("role") != "passenger":
        raise HTTPException(401, "No session. Give consent first.")
    # Erasure ends the session at once, on every device, even though the token has not expired.
    if await redis().exists(f"gone:{claims['sub']}"):
        raise HTTPException(401, "Session no longer exists.")
    return claims["sub"]


async def _refresh(request: Request, response: Response) -> dict | None:
    """The access token has expired: trade the refresh token for a new pair, once."""
    claims = _decode(request.cookies.get(REFRESH_COOKIE), "refresh")
    if not claims:
        return None
    if claims.get("sv", 0) != await session_version(claims["sub"]):
        return None  # signed out everywhere since this token was issued
    if not await redis().getdel(f"refresh:{claims['jti']}"):
        # A refresh token is single use. One coming back a second time, before logout, means a copy exists:
        # end every session of that person, so whoever holds the copy is out too.
        if not await redis().exists(f"loggedout:{claims['jti']}"):
            await end_all_sessions(claims["sub"])
        return None
    async with session() as db:
        user = await db.get(StaffUser, claims["sub"])  # read the role again, in case it changed
    if user is None:
        return None
    await issue_staff(response, user)
    return {"id": user.id, "email": user.email, "role": user.role, "jti": None, "exp": int(time.time()) + get_settings().access_token_minutes * 60, "sv": await session_version(user.id)}


def staff(*roles: str):
    """Role-based access. `admin` may use every staff route."""
    async def check(request: Request, response: Response) -> dict:
        claims = _decode(request.cookies.get(STAFF_COOKIE), "access")
        if claims and (await redis().exists(f"denied:{claims['jti']}") or claims.get("sv", 0) != await session_version(claims["sub"])):
            claims = None
        user = {"id": claims["sub"], "email": claims["email"], "role": claims["role"], "jti": claims["jti"], "exp": claims["exp"], "sv": claims.get("sv", 0)} if claims else await _refresh(request, response)
        if not user:
            raise HTTPException(401, "Not logged in.")
        if user["role"] not in ROLES or (roles and user["role"] != "admin" and user["role"] not in roles):
            raise HTTPException(403, "Your role cannot use this.")
        return user
    return Depends(check)


async def limit(key: str, attempts: int, window_s: int, message: str) -> None:
    """A small fixed-window rate limit in Redis."""
    count = await redis().incr(key)
    if count == 1:
        await redis().expire(key, window_s)
    if count > attempts:
        raise HTTPException(429, message)


def client_address(request: Request) -> str:
    """Best-effort address for rate limits. A forwarded header is read only when the request came from
    a private address (our own web container), and then the entry nearest to us is used. A client can
    still forge that header through the proxy, so every limit that matters also has a key that does not
    depend on the address (per account, per session, or global)."""
    peer = request.client.host if request.client else "?"
    forwarded = request.headers.get("x-forwarded-for")
    try:
        behind_proxy = ipaddress.ip_address(peer).is_private
    except ValueError:
        behind_proxy = False
    return forwarded.split(",")[-1].strip()[:64] if forwarded and behind_proxy else peer


async def staff_alive(user: dict) -> bool:
    """Is this staff session still good? Asked again while a live stream is open."""
    if user["exp"] <= time.time() or user["sv"] != await session_version(user["id"]):
        return False
    return not (user["jti"] and await redis().exists(f"denied:{user['jti']}"))


async def passenger_alive(principal_id: str) -> bool:
    return not await redis().exists(f"gone:{principal_id}")


async def sse(channel: str, owner: str, alive=None) -> StreamingResponse:
    """Stream a Redis pub/sub channel to the browser, with a heartbeat so proxies keep it open.
    `owner` may hold only a few streams at once (each one keeps a Redis connection). `alive` is asked
    every 15 seconds: when the session has ended the stream closes, and the browser's reconnect is
    then refused like any other request."""
    key = f"streams:{owner}"
    if await redis().incr(key) > get_settings().max_streams_per_session:
        await redis().decr(key)
        raise HTTPException(429, "Too many live connections from this session. Close other tabs.")
    await redis().expire(key, 6 * 3600)

    async def stream() -> AsyncIterator[str]:
        pubsub = redis().pubsub()
        try:
            await pubsub.subscribe(channel)
            yield ": connected\n\n"
            checked = time.time()
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15)
                if alive and time.time() - checked >= 15:
                    checked = time.time()
                    if not await alive():
                        break
                if message is None:
                    yield ": keep-alive\n\n"
                    continue
                body = json.loads(message["data"])
                yield f"event: {body['event']}\ndata: {json.dumps(body['data'])}\n\n"
                await asyncio.sleep(0)
        finally:
            await redis().decr(key)
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
