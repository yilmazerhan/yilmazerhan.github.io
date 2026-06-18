"""team_tasks: add team_tasks and team_task_assignees tables, add team_task_id to email_logs

Revision ID: 0031_team_tasks
Revises: 0030_inventory_owner
Create Date: 2026-06-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0031_team_tasks"
down_revision = "0030_inventory_owner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team_tasks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("deadline", sa.Date, nullable=False),
        sa.Column("reminder_days_before", sa.Integer, nullable=False, server_default="3"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_team_tasks_deadline", "team_tasks", ["deadline"])
    op.create_index("ix_team_tasks_status", "team_tasks", ["status"])

    op.create_table(
        "team_task_assignees",
        sa.Column("team_task_id", UUID(as_uuid=True), sa.ForeignKey("team_tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )

    op.add_column(
        "email_logs",
        sa.Column("team_task_id", UUID(as_uuid=True), sa.ForeignKey("team_tasks.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_email_logs_team_task_id", "email_logs", ["team_task_id"])


def downgrade() -> None:
    op.drop_index("ix_email_logs_team_task_id", table_name="email_logs")
    op.drop_column("email_logs", "team_task_id")
    op.drop_table("team_task_assignees")
    op.drop_index("ix_team_tasks_status", table_name="team_tasks")
    op.drop_index("ix_team_tasks_deadline", table_name="team_tasks")
    op.drop_table("team_tasks")
