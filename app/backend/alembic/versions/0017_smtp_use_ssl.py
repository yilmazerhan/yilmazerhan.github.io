"""smtp_configs: add use_ssl column

Revision ID: 0017_smtp_use_ssl
Revises: 0016_inventory_items
Create Date: 2026-05-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0017_smtp_use_ssl"
down_revision = "0016_inventory_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "smtp_configs",
        sa.Column("use_ssl", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("smtp_configs", "use_ssl")
