"""email_workflow: add dashboard_report trigger and specific_emails recipient type

Revision ID: 0018_dashboard_report_workflow
Revises: 0017_smtp_use_ssl
Create Date: 2026-05-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0018_dashboard_report_workflow"
down_revision = "0017_smtp_use_ssl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL: add new values to existing enums (cannot be done in a transaction)
    op.execute("ALTER TYPE email_workflow_trigger_type ADD VALUE IF NOT EXISTS 'dashboard_report'")
    op.execute("ALTER TYPE email_workflow_recipient_type ADD VALUE IF NOT EXISTS 'specific_emails'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; this is intentionally a no-op.
    pass
