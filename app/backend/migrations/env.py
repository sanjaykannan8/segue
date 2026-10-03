from alembic import context
from sqlalchemy import create_engine

from segue.core.db import Base
from segue.core.settings import get_settings

# Alembic runs synchronously, so swap the async driver for psycopg2.
url = get_settings().database_url.replace("+asyncpg", "+psycopg2")
target_metadata = Base.metadata


def run() -> None:
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run()
