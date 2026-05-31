"""Add login/logout values to audit_action enum

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-31
"""
from alembic import op

revision = "0021_audit_log_auth_events"
down_revision = "0020_announcement_i18n"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction block
    op.execute("COMMIT")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'login'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'logout'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values — migration is irreversible
    pass
