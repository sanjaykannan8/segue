"""The API: REST plus server-sent events. One producer to Redpanda is shared by all requests."""
from contextlib import asynccontextmanager

from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from ..core.bus import kafka_producer
from ..core.settings import get_settings
from . import admin, passenger, staff


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.producer = await kafka_producer()
    yield
    await app.state.producer.stop()


ALLOWED = {o.strip() for o in get_settings().web_origin.split(",")}
MAX_BODY = 64 * 1024

app = FastAPI(title="Segue", lifespan=lifespan)
# Cookies are sent only to the one web origin we name. No wildcard.
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in get_settings().web_origin.split(",")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def guard(request: Request, call_next):
    """Cookies carry the session, so a request that changes something must come from our own pages.
    A browser says where a request came from (Sec-Fetch-Site, Origin); anything from another site, or
    from another port on this host, is refused. Scripts send neither header and are not affected:
    they hold no cookie a browser attack could ride on."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if int(request.headers.get("content-length") or 0) > MAX_BODY:
            return JSONResponse({"detail": "Request too large."}, status_code=413)
        origin = request.headers.get("origin")
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        foreign = origin is not None and origin not in ALLOWED and urlsplit(origin).netloc != host
        if request.headers.get("sec-fetch-site") in ("cross-site", "same-site") and origin not in ALLOWED or foreign:
            return JSONResponse({"detail": "Request refused: it did not come from Segue."}, status_code=403)
    response = await call_next(request)
    if request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip() == "https":
        # Reached over HTTPS (a tunnel or a real deployment): cookies must never travel in clear text.
        response.raw_headers[:] = [(k, v + b"; Secure") if k == b"set-cookie" and b"; secure" not in v.lower() else (k, v) for k, v in response.raw_headers]
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    response.headers.setdefault("Cache-Control", "no-store")  # personal data is never kept by a browser or a proxy
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


app.include_router(passenger.router)
app.include_router(staff.router)
app.include_router(admin.router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}
