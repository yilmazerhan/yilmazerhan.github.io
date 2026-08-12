"""inventory_owner: add owner column to inventory_items

Revision ID: 0030_inventory_owner
Revises: 0029_all_users_recipient_type
Create Date: 2026-06-10
"""

from alembic import op
import sqlalchemy as sa

revision = "0030_inventory_owner"
down_revision = "0029_all_users_recipient_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory_items", sa.Column("owner", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_items", "owner")
