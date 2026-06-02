"""customer_patches: add customer_patches table

Revision ID: 0022_customer_patches
Revises: 0021_audit_log_auth_events
Create Date: 2026-06-02
"""

from alembic import op

revision = "0022_customer_patches"
down_revision = "0021_audit_log_auth_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_patches (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer    VARCHAR(255) NOT NULL,
            jira_ticket VARCHAR(100),
            app_version VARCHAR(100) NOT NULL,
            apply_date  DATE NOT NULL,
            environment VARCHAR(100),
            status      VARCHAR(50) NOT NULL DEFAULT 'applied',
            description TEXT,
            created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_patches_customer ON customer_patches (customer)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_patches_jira_ticket ON customer_patches (jira_ticket)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_patches_apply_date ON customer_patches (apply_date)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_patches_status ON customer_patches (status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_customer_patches_status")
    op.execute("DROP INDEX IF EXISTS ix_customer_patches_apply_date")
    op.execute("DROP INDEX IF EXISTS ix_customer_patches_jira_ticket")
    op.execute("DROP INDEX IF EXISTS ix_customer_patches_customer")
    op.drop_table("customer_patches")
