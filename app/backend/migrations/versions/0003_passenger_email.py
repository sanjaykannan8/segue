"""PassengerPII.email_enc: an optional, encrypted email address for connection updates."""
revision = "0003"
down_revision = "0002"

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    columns = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("passenger_pii")]
    if "email_enc" not in columns:
        op.add_column("passenger_pii", sa.Column("email_enc", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("passenger_pii", "email_enc")
