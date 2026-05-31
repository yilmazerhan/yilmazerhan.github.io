"""announcements: add title_en and message_en columns for bilingual support

Revision ID: 0020_announcement_i18n
Revises: 0019_announcements
Create Date: 2026-05-31
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_announcement_i18n"
down_revision = "0019_announcements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("announcements")}
    if "title_en" not in existing_cols:
        op.add_column("announcements", sa.Column("title_en", sa.String(200), nullable=True))
    if "message_en" not in existing_cols:
        op.add_column("announcements", sa.Column("message_en", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("announcements", "message_en")
    op.drop_column("announcements", "title_en")
