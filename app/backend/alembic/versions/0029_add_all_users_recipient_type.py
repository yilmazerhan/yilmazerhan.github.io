"""Add all_users value to recipient_type enum

Revision ID: 0029_add_all_users_recipient_type
Revises: 0028_patch_files_jsonb
Create Date: 2026-06-06
"""
from alembic import op

revision = '0029_add_all_users_recipient_type'
down_revision = '0028_patch_files_jsonb'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE recipient_type ADD VALUE IF NOT EXISTS 'all_users'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is a no-op.
    pass
