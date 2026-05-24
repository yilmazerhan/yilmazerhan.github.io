"""backup_records table

Revision ID: 0010_backup_records
Revises: 0009_leave_requests
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0010_backup_records"
down_revision = "0009_leave_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backup_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("backup_type", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_backup_records_created_at", "backup_records", ["created_at"])

    # Seed backup schedule settings into app_settings
    op.execute("""
        INSERT INTO app_settings (key, value)
        VALUES
            ('backup_enabled', 'false'),
            ('backup_frequency', 'daily'),
            ('backup_hour', '2'),
            ('backup_day_of_week', '0'),
            ('backup_retention_count', '10')
        ON CONFLICT (key) DO NOTHING;
    """)


def downgrade() -> None:
    op.drop_index("ix_backup_records_created_at", table_name="backup_records")
    op.drop_table("backup_records")
    op.execute("""
        DELETE FROM app_settings WHERE key IN (
            'backup_enabled','backup_frequency','backup_hour',
            'backup_day_of_week','backup_retention_count'
        );
    """)
