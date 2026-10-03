"""Initial schema: every table in segue.core.db."""
revision = "0001"
down_revision = None

from alembic import op

from segue.core.db import Base


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
