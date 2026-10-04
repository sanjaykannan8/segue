"""Retention worker. Personal data is erased a fixed time after the outbound flight departs
(RETENTION_HOURS). Nobody has to remember to delete it."""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import delete, select

from ..core.db import Connection, ConnectionRisk, DataPrincipal, DeadEvent, Decision, FeedItem, FlightInstance, Itinerary, Outbox, ProcessedMessage, now, session
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
        await db.execute(delete(FeedItem).where(FeedItem.created_at < cutoff))
        # Published messages and dead events have done their job; their payloads carry seats and trip IDs.
        await db.execute(delete(Outbox).where(Outbox.sent_at.is_not(None), Outbox.sent_at < cutoff))
        await db.execute(delete(Outbox).where(Outbox.expires_at.is_not(None), Outbox.expires_at < cutoff))
        await db.execute(delete(DeadEvent).where(DeadEvent.created_at < cutoff))
        # Connections nobody is on any more, whose onward flight left before the window: the rows that hang
        # off them go first, then the flights no connection uses.
        old = select(FlightInstance.id).where(FlightInstance.sched_dep.is_not(None), FlightInstance.sched_dep < cutoff)
        finished = list((await db.execute(select(Connection.id).where(Connection.outbound_id.in_(old), ~Connection.id.in_(select(Itinerary.connection_id))))).scalars())
        if finished:
            for table in (Decision, ConnectionRisk, FeedItem):
                await db.execute(delete(table).where(table.connection_id.in_(finished)))
            await db.execute(delete(Connection).where(Connection.id.in_(finished)))
        used = select(Connection.inbound_id).union(select(Connection.outbound_id))
        await db.execute(delete(FlightInstance).where(FlightInstance.id.in_(old), ~FlightInstance.id.in_(used)))
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
            log.warning("purge failed: %s", type(error).__name__)
        await asyncio.sleep(TICK_S)


if __name__ == "__main__":
    asyncio.run(main())
