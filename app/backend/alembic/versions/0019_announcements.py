"""announcements: add announcements table

Revision ID: 0019_announcements
Revises: 0018_dashboard_report_workflow
Create Date: 2026-05-31
"""

from alembic import op

revision = "0019_announcements"
down_revision = "0018_dashboard_report_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent type creation — DO/EXCEPTION is the PG15-safe way to avoid
    # "already exists" errors when a previous partial run left the types behind.
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE announcement_type AS ENUM ('info', 'warning', 'error', 'success');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE announcement_target_type AS ENUM ('all', 'specific_teams', 'specific_users');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    # Use raw SQL so SQLAlchemy never touches the enum types again.
    # op.create_table with sa.Enum ignores create_type=False in some SA versions
    # and tries to CREATE TYPE a second time, causing DuplicateObjectError.
    op.execute("""
        CREATE TABLE IF NOT EXISTS announcements (
            id          UUID PRIMARY KEY,
            title       VARCHAR(200) NOT NULL,
            message     TEXT NOT NULL,
            type        announcement_type NOT NULL DEFAULT 'info',
            target_type announcement_target_type NOT NULL DEFAULT 'all',
            target_ids  JSONB,
            starts_at   TIMESTAMPTZ NOT NULL,
            ends_at     TIMESTAMPTZ,
            is_active   BOOLEAN NOT NULL DEFAULT TRUE,
            created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_is_active ON announcements (is_active)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_starts_at ON announcements (starts_at)")


def downgrade() -> None:
    op.drop_table("announcements")
    op.execute("DROP TYPE IF EXISTS announcement_type")
    op.execute("DROP TYPE IF EXISTS announcement_target_type")
