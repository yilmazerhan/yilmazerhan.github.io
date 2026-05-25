"""kanban: is_personal flag + fix column_id FK cascade

Revision ID: 0015_kanban_personal_boards
Revises: 0014_user_teams
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0015_kanban_personal_boards"
down_revision = "0014_user_teams"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add is_personal column to kanban_boards
    op.add_column(
        "kanban_boards",
        sa.Column("is_personal", sa.Boolean(), nullable=False, server_default="false"),
    )

    # 2. Fix column_id FK on tasks: RESTRICT → CASCADE so board deletion cascades to tasks
    op.drop_constraint("tasks_column_id_fkey", "tasks", type_="foreignkey")
    op.create_foreign_key(
        "tasks_column_id_fkey",
        "tasks",
        "kanban_columns",
        ["column_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 3. Create personal boards for all existing active, non-deleted users
    #    who don't already have a personal board
    op.execute("""
        WITH users_needing_board AS (
            SELECT id AS user_id
            FROM users
            WHERE is_active = true AND is_deleted = false
        ),
        inserted_boards AS (
            INSERT INTO kanban_boards (id, name, description, color, created_by, is_personal, is_archived)
            SELECT
                gen_random_uuid(),
                'Kişisel Pano',
                'Yalnızca size özel kanban panonuz.',
                '#8b5cf6',
                u.user_id,
                true,
                false
            FROM users_needing_board u
            RETURNING id, created_by
        )
        INSERT INTO kanban_columns (id, board_id, name, name_key, color, sort_order, is_terminal)
        SELECT
            gen_random_uuid(),
            b.id,
            col.name,
            col.name_key,
            col.color,
            col.sort_order,
            col.is_terminal
        FROM inserted_boards b
        CROSS JOIN (
            VALUES
                ('Bekleyen',    'kanban.col_pending',     '#e2e8f0', 0, false),
                ('Devam Eden',  'kanban.col_in_progress', '#fef3c7', 1, false),
                ('İncelemede',  'kanban.col_in_review',   '#dbeafe', 2, false),
                ('Tamamlandı',  'kanban.col_done',        '#d1fae5', 3, true)
        ) AS col(name, name_key, color, sort_order, is_terminal)
    """)


def downgrade() -> None:
    # Remove personal boards
    op.execute("DELETE FROM kanban_boards WHERE is_personal = true")

    # Revert column_id FK
    op.drop_constraint("tasks_column_id_fkey", "tasks", type_="foreignkey")
    op.create_foreign_key(
        "tasks_column_id_fkey",
        "tasks",
        "kanban_columns",
        ["column_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # Remove column
    op.drop_column("kanban_boards", "is_personal")
