"""add kanban_boards table and board_id to columns

Revision ID: 0012_kanban_boards
Revises: 0011_add_name_key
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012_kanban_boards"
down_revision = "0011_add_name_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create kanban_boards table ────────────────────────────────────────────
    op.create_table(
        "kanban_boards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── Insert the default "Genel" board ─────────────────────────────────────
    op.execute(
        """
        INSERT INTO kanban_boards (id, name, description, color, is_archived, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Genel', 'Varsayılan kanban panosu', '#6366f1', false, now(), now())
        """
    )

    # ── Add board_id FK column to kanban_columns (nullable initially) ─────────
    op.add_column(
        "kanban_columns",
        sa.Column("board_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("kanban_boards.id", ondelete="CASCADE"), nullable=True),
    )

    # ── Assign all existing columns to the default board ─────────────────────
    op.execute(
        """
        UPDATE kanban_columns
        SET board_id = (SELECT id FROM kanban_boards WHERE name = 'Genel' LIMIT 1)
        WHERE board_id IS NULL
        """
    )

    # ── Make board_id NOT NULL (all rows now have a value) ────────────────────
    op.alter_column("kanban_columns", "board_id", nullable=False)

    # ── Index for fast board→columns lookup ──────────────────────────────────
    op.create_index("ix_kanban_columns_board_id", "kanban_columns", ["board_id"])


def downgrade() -> None:
    op.drop_index("ix_kanban_columns_board_id", table_name="kanban_columns")
    op.drop_column("kanban_columns", "board_id")
    op.drop_table("kanban_boards")
