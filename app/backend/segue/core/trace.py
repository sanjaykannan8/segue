"""A running record of what the system does, for the demo page.

Every stage of the pipeline adds one entry: the event arriving, the buffer, the risk (cache hit or
model call, with its time), each decision and its gate, the outbox publish, the delivery. Entries
hold seats, flight numbers and model answers. Never a name, a phone number, a principal ID or
an assistance need. The list expires after a day.

Tracing is best-effort: if Redis is unavailable the pipeline carries on without it.
"""
import json
import logging

from .bus import redis
from .db import now, uid

LOG_KEY = "trace:log"
CHANNEL = "live:trace"
KEEP = 600
log = logging.getLogger("segue.trace")

# stage -> the pipeline node it lights up on the demo page
STAGES = ("event", "buffer", "risk", "ops", "passenger", "decision", "publish", "deliver")


async def trace(event_id: str | None, stage: str, title: str, **detail) -> None:
    entry = {"id": uid(), "at": now().isoformat(), "event_id": event_id, "stage": stage, "title": title, "detail": detail}
    try:
        client = redis()
        await client.lpush(LOG_KEY, json.dumps(entry))
        await client.ltrim(LOG_KEY, 0, KEEP - 1)
        await client.expire(LOG_KEY, 24 * 3600)
        await client.publish(CHANNEL, json.dumps({"event": "trace", "data": entry}))
    except Exception as error:  # never let the demo record break the real work
        log.debug("trace skipped: %r", error)


async def recent(limit: int = 200) -> list[dict]:
    """Newest first."""
    return [json.loads(item) for item in await redis().lrange(LOG_KEY, 0, max(0, min(limit, KEEP) - 1))]


async def clear() -> None:
    await redis().delete(LOG_KEY)
