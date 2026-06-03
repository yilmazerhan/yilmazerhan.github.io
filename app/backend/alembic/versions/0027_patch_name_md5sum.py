"""patch_name_md5sum: add patch_name and md5sum columns to customer_patches

Revision ID: 0027_patch_name_md5sum
Revises: 0026_worklog_reminder_template
Create Date: 2026-06-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0027_patch_name_md5sum"
down_revision = "0026_worklog_reminder_template"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customer_patches", sa.Column("patch_name", sa.String(255), nullable=True))
    op.add_column("customer_patches", sa.Column("md5sum", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("customer_patches", "md5sum")
    op.drop_column("customer_patches", "patch_name")
