"""Add completed_at to team_task_assignees

Revision ID: 0032_team_task_completion
Revises: 0031_team_tasks
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0032_team_task_completion"
down_revision = "0031_team_tasks"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "team_task_assignees",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("team_task_assignees", "completed_at")
