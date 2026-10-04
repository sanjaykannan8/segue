"""JWT sign-in and role-based access, tested through a small app that uses the real dependencies."""
import time

import httpx
import jwt
import pytest
from fastapi import Depends, FastAPI, Request, Response

from segue.api import deps
from segue.core import db
from segue.core.db import StaffUser
from segue.core.settings import get_settings
from segue.core.util import hash_password


def build() -> FastAPI:
    app = FastAPI()

    @app.post("/login/{role}")
    async def login(role: str, response: Response):
        async with db.session() as s:
            user = StaffUser(email=f"{role}@segue.local", role=role, password_hash=hash_password("x"))
            s.add(user)
            await s.commit()
        await deps.issue_staff(response, user)
        return {"ok": True}

    @app.post("/logout")
    async def logout(request: Request):
        out = Response(status_code=204)
        await deps.revoke_staff(request, out)
        return out

    @app.post("/pax")
    async def pax(response: Response):
        deps.issue_passenger(response, "principal-1")
        return {"ok": True}

    @app.get("/ops-only")
    async def ops_only(user: dict = deps.staff("ops")):
        return user

    @app.get("/any-staff")
    async def any_staff(user: dict = deps.staff()):
        return user

    @app.get("/me")
    async def me(principal_id: str = Depends(deps.passenger)):
        return {"principal_id": principal_id}

    return app


@pytest.fixture
def client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=build()), base_url="http://test")


async def test_role_is_enforced_from_the_token(client):
    assert (await client.get("/ops-only")).status_code == 401
    await client.post("/login/crew")
    assert (await client.get("/any-staff")).json()["role"] == "crew"
    assert (await client.get("/ops-only")).status_code == 403, "a crew token cannot use an ops route"
    await client.post("/login/ops")
    assert (await client.get("/ops-only")).status_code == 200
    await client.post("/login/admin")
    assert (await client.get("/ops-only")).status_code == 200, "admin may use every staff route"


async def test_tampered_or_forged_tokens_are_refused(client):
    await client.post("/login/crew")
    token = client.cookies.get(deps.STAFF_COOKIE)
    claims = jwt.decode(token, options={"verify_signature": False})
    forged = jwt.encode({**claims, "role": "admin"}, "not-the-secret-but-long-enough-for-hs256", algorithm="HS256")
    for bad in (forged, token[:-4] + "AAAA", jwt.encode({**claims, "role": "admin"}, key=None, algorithm="none")):
        fresh = httpx.AsyncClient(transport=client._transport, base_url="http://test", cookies={deps.STAFF_COOKIE: bad})
        assert (await fresh.get("/any-staff")).status_code == 401


async def test_a_passenger_token_is_not_a_staff_token(client):
    await client.post("/pax")
    assert (await client.get("/me")).json() == {"principal_id": "principal-1"}
    pax = client.cookies.get(deps.PAX_COOKIE)
    fresh = httpx.AsyncClient(transport=client._transport, base_url="http://test", cookies={deps.STAFF_COOKIE: pax})
    assert (await fresh.get("/any-staff")).status_code == 401, "token kinds are not interchangeable"


async def test_expired_access_is_renewed_once_by_the_refresh_token(client):
    await client.post("/login/ops")
    refresh = client.cookies.get(deps.REFRESH_COOKIE)
    s = get_settings()
    expired = jwt.encode({"sub": "u", "email": "ops@segue.local", "role": "ops", "typ": "access", "iat": int(time.time()) - 100, "exp": int(time.time()) - 10, "jti": "old", "iss": "segue"}, s.jwt_secret, algorithm="HS256")
    first = httpx.AsyncClient(transport=client._transport, base_url="http://test", cookies={deps.STAFF_COOKIE: expired, deps.REFRESH_COOKIE: refresh})
    response = await first.get("/ops-only")
    assert response.status_code == 200 and deps.STAFF_COOKIE in response.cookies, "a new access token is issued"
    replay = httpx.AsyncClient(transport=client._transport, base_url="http://test", cookies={deps.STAFF_COOKIE: expired, deps.REFRESH_COOKIE: refresh})
    assert (await replay.get("/ops-only")).status_code == 401, "a refresh token works once: a stolen copy is useless after rotation"


async def test_logout_revokes_both_tokens(client):
    await client.post("/login/ops")
    access, refresh = client.cookies.get(deps.STAFF_COOKIE), client.cookies.get(deps.REFRESH_COOKIE)
    assert (await client.post("/logout")).status_code == 204
    stolen = httpx.AsyncClient(transport=client._transport, base_url="http://test", cookies={deps.STAFF_COOKIE: access, deps.REFRESH_COOKIE: refresh})
    assert (await stolen.get("/ops-only")).status_code == 401, "tokens copied before logout stop working"


async def test_cookies_are_http_only(client):
    response = await client.post("/login/ops")
    headers = response.headers.get_list("set-cookie")
    assert len(headers) == 2 and all("HttpOnly" in h and "SameSite=lax" in h for h in headers)
