"""announcements: add announcements table

Revision ID: 0019_announcements
Revises: 0018_dashboard_report_workflow
Create Date: 2026-05-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0019_announcements"
down_revision = "0018_dashboard_report_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS guards against a partial previous run that created the types
    op.execute("CREATE TYPE IF NOT EXISTS announcement_type AS ENUM ('info', 'warning', 'error', 'success')")
    op.execute("CREATE TYPE IF NOT EXISTS announcement_target_type AS ENUM ('all', 'specific_teams', 'specific_users')")

    conn = op.get_bind()
    inspector = sa.inspect(conn)
    table_exists = "announcements" in inspector.get_table_names()

    if not table_exists:
        op.create_table(
            "announcements",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("message", sa.Text, nullable=False),
            sa.Column("type", sa.Enum("info", "warning", "error", "success", name="announcement_type", create_type=False), nullable=False, server_default="info"),
            sa.Column("target_type", sa.Enum("all", "specific_teams", "specific_users", name="announcement_target_type", create_type=False), nullable=False, server_default="all"),
            sa.Column("target_ids", postgresql.JSONB, nullable=True),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_announcements_is_active", "announcements", ["is_active"])
        op.create_index("ix_announcements_starts_at", "announcements", ["starts_at"])
    else:
        existing_indexes = {i["name"] for i in inspector.get_indexes("announcements")}
        if "ix_announcements_is_active" not in existing_indexes:
            op.create_index("ix_announcements_is_active", "announcements", ["is_active"])
        if "ix_announcements_starts_at" not in existing_indexes:
            op.create_index("ix_announcements_starts_at", "announcements", ["starts_at"])


def downgrade() -> None:
    op.drop_table("announcements")
    op.execute("DROP TYPE IF EXISTS announcement_type")
    op.execute("DROP TYPE IF EXISTS announcement_target_type")
