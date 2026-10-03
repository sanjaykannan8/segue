"""Retention worker. Personal data is erased a fixed time after the outbound flight departs
(RETENTION_HOURS). Nobody has to remember to delete it."""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import delete, select

from ..core.db import DataPrincipal, FeedItem, Itinerary, ProcessedMessage, now, session
from ..core.settings import get_settings
from .service import erase_principal

log = logging.getLogger("segue.privacy")
TICK_S = 300


async def purge() -> int:
    async with session() as db:
        due = list((await db.execute(select(Itinerary.principal_id).where(Itinerary.expires_at.is_not(None), Itinerary.expires_at < now()).distinct())).scalars())
        # People who consented but never added a trip have no expiry date of their own: purge them after the same window.
        cutoff = now() - timedelta(hours=get_settings().retention_hours)
        idle = (await db.execute(select(DataPrincipal.id).where(DataPrincipal.created_at < cutoff, ~DataPrincipal.id.in_(select(Itinerary.principal_id))))).scalars()
        due = list(dict.fromkeys([*due, *idle]))
        for principal_id in due:
            await erase_principal(db, principal_id, actor="retention", reason="retention")
        # Staff feed rows and the inbox table carry no names, but they have no reason to outlive the trip either.
        await db.execute(delete(FeedItem).where(FeedItem.expires_at.is_not(None), FeedItem.expires_at < now()))
        await db.execute(delete(FeedItem).where(FeedItem.created_at < now() - timedelta(days=2)))
        await db.execute(delete(ProcessedMessage).where(ProcessedMessage.at < now() - timedelta(days=7)))
        await db.commit()
        return len(due)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    log.info("retention worker running")
    while True:
        try:
            erased = await purge()
            if erased:
                log.info("retention erased %d principal(s)", erased)
        except Exception as error:
            log.warning("purge failed: %r", error)
        await asyncio.sleep(TICK_S)


if __name__ == "__main__":
    asyncio.run(main())
