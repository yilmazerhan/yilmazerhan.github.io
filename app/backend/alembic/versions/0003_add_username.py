"""Add username to users and new_account email template

Revision ID: 0003_add_username
Revises: 0002_reconcile
Create Date: 2025-05-23 00:00:00.000001
"""
from alembic import op
import sqlalchemy as sa

revision = '0003_add_username'
down_revision = '0002_reconcile'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add nullable first so existing rows can get a default value
    op.add_column('users', sa.Column('username', sa.String(100), nullable=True))

    # Populate from email prefix for existing rows
    op.execute("""
        UPDATE users SET username = LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-z0-9_]', '_', 'g'))
        WHERE username IS NULL
    """)

    # Handle duplicate usernames by appending a numeric suffix
    op.execute("""
        WITH ranked AS (
            SELECT id,
                   username AS base_username,
                   ROW_NUMBER() OVER (PARTITION BY username ORDER BY created_at) - 1 AS rn
            FROM users
        )
        UPDATE users
        SET username = CASE
            WHEN ranked.rn > 0 THEN ranked.base_username || ranked.rn::text
            ELSE ranked.base_username
        END
        FROM ranked
        WHERE users.id = ranked.id AND ranked.rn > 0
    """)

    # Now make it NOT NULL and add unique constraint
    op.alter_column('users', 'username', nullable=False)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_users_username', table_name='users')
    op.drop_column('users', 'username')
