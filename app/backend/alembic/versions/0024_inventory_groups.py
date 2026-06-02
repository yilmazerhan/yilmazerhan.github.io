"""inventory_groups: add server/item grouping support

Revision ID: 0024_inventory_groups
Revises: 0023_repair_user_teams
Create Date: 2026-06-02
"""

from alembic import op

revision = "0024_inventory_groups"
down_revision = "0023_repair_user_teams"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS inventory_groups (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            group_type  VARCHAR(50) NOT NULL DEFAULT 'related',
            color       VARCHAR(7) NOT NULL DEFAULT '#6366f1',
            created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("""
        ALTER TABLE inventory_items
        ADD COLUMN IF NOT EXISTS group_id UUID
            REFERENCES inventory_groups(id) ON DELETE SET NULL
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_inventory_items_group_id
        ON inventory_items (group_id)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_inventory_items_group_id")
    op.execute("ALTER TABLE inventory_items DROP COLUMN IF EXISTS group_id")
    op.execute("DROP TABLE IF EXISTS inventory_groups")
