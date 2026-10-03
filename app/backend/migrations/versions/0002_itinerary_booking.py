"""Itinerary.booking: single ticket or separate tickets (self-transfer)."""
revision = "0002"
down_revision = "0001"

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    # A database created after this column was added to the model already has it.
    columns = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("itinerary")]
    if "booking" not in columns:
        op.add_column("itinerary", sa.Column("booking", sa.String(20), nullable=False, server_default="single_ticket"))


def downgrade() -> None:
    op.drop_column("itinerary", "booking")
