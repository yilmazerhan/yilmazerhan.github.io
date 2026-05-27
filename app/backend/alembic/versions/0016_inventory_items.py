"""inventory: inventory_items + inventory_email_schedules tables + permission_module enum extension

Revision ID: 0016_inventory_items
Revises: 0015_kanban_personal_boards
Create Date: 2026-05-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision = "0016_inventory_items"
down_revision = "0015_kanban_personal_boards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Extend the permission_module enum — idempotent (IF NOT EXISTS)
    op.execute("ALTER TYPE permission_module ADD VALUE IF NOT EXISTS 'inventory'")

    # 2. Create inventory_items table
    op.create_table(
        "inventory_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("item_type", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("tags", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),

        # Server / shared
        sa.Column("hostname", sa.String(255), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("port", sa.Integer, nullable=True),
        sa.Column("username", sa.String(255), nullable=True),
        sa.Column("password_encrypted", sa.Text, nullable=True),
        sa.Column("ssh_key_encrypted", sa.Text, nullable=True),
        sa.Column("operating_system", sa.String(100), nullable=True),

        # Database-specific
        sa.Column("database_name", sa.String(255), nullable=True),
        sa.Column("database_type", sa.String(50), nullable=True),

        # Email account
        sa.Column("email_address", sa.String(255), nullable=True),
        sa.Column("smtp_host", sa.String(255), nullable=True),
        sa.Column("smtp_port", sa.Integer, nullable=True),
        sa.Column("imap_host", sa.String(255), nullable=True),
        sa.Column("imap_port", sa.Integer, nullable=True),

        # Cloud account
        sa.Column("provider", sa.String(50), nullable=True),
        sa.Column("account_id", sa.String(255), nullable=True),
        sa.Column("access_key_id_encrypted", sa.Text, nullable=True),
        sa.Column("secret_access_key_encrypted", sa.Text, nullable=True),
        sa.Column("region", sa.String(100), nullable=True),

        # Generic
        sa.Column("url", sa.String(1000), nullable=True),

        # Audit
        sa.Column(
            "created_by", UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "updated_by", UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False
        ),
    )
    op.create_index("ix_inventory_items_item_type", "inventory_items", ["item_type"])
    op.create_index("ix_inventory_items_created_at", "inventory_items", ["created_at"])
    op.create_index("ix_inventory_items_display_name", "inventory_items", ["display_name"])

    # 3. Create inventory_email_schedules table
    op.create_table(
        "inventory_email_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("frequency", sa.String(20), nullable=False, server_default=sa.text("'weekly'")),
        sa.Column("day_of_week", sa.Integer, nullable=True),
        sa.Column("day_of_month", sa.Integer, nullable=True),
        sa.Column("hour", sa.Integer, nullable=False, server_default="8"),
        sa.Column("recipient_emails", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_by", UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("inventory_email_schedules")
    op.drop_index("ix_inventory_items_display_name", table_name="inventory_items")
    op.drop_index("ix_inventory_items_created_at", table_name="inventory_items")
    op.drop_index("ix_inventory_items_item_type", table_name="inventory_items")
    op.drop_table("inventory_items")
    # NOTE: PostgreSQL does not support removing enum values.
    # The 'inventory' value added to permission_module cannot be removed in downgrade.
    # A full enum recreation (CREATE TYPE ... AS ENUM, ALTER COLUMN ... TYPE ..., DROP TYPE ...)
    # would be required to fully roll back this change.
