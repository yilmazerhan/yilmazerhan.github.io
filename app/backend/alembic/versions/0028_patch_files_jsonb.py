"""Replace patch_name and md5sum columns with patch_files JSONB array

Revision ID: 0028_patch_files_jsonb
Revises: 0027_patch_name_md5sum
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0028_patch_files_jsonb"
down_revision = "0027_patch_name_md5sum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Migrate existing single values into the new array column
    op.add_column(
        "customer_patches",
        sa.Column("patch_files", JSONB, nullable=False, server_default="[]"),
    )

    # Migrate any existing patch_name/md5sum rows into patch_files array
    op.execute(
        """
        UPDATE customer_patches
        SET patch_files = CASE
            WHEN patch_name IS NOT NULL OR md5sum IS NOT NULL THEN
                jsonb_build_array(
                    jsonb_build_object(
                        'patch_name', COALESCE(patch_name, ''),
                        'md5sum', COALESCE(md5sum, '')
                    )
                )
            ELSE '[]'::jsonb
        END
        """
    )

    op.drop_column("customer_patches", "patch_name")
    op.drop_column("customer_patches", "md5sum")


def downgrade() -> None:
    op.add_column(
        "customer_patches",
        sa.Column("patch_name", sa.String(255), nullable=True),
    )
    op.add_column(
        "customer_patches",
        sa.Column("md5sum", sa.String(64), nullable=True),
    )
    # Restore first element from array back to columns
    op.execute(
        """
        UPDATE customer_patches
        SET
            patch_name = NULLIF((patch_files->0->>'patch_name'), ''),
            md5sum = NULLIF((patch_files->0->>'md5sum'), '')
        WHERE jsonb_array_length(patch_files) > 0
        """
    )
    op.drop_column("customer_patches", "patch_files")
