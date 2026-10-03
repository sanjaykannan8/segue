"""The API: REST plus server-sent events. One producer to Redpanda is shared by all requests."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..core.bus import kafka_producer
from ..core.settings import get_settings
from . import admin, passenger, staff


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.producer = await kafka_producer()
    yield
    await app.state.producer.stop()


app = FastAPI(title="Segue", lifespan=lifespan)
# Cookies are sent only to the one web origin we name. No wildcard.
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in get_settings().web_origin.split(",")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(passenger.router)
app.include_router(staff.router)
app.include_router(admin.router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}
