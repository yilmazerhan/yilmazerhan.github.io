"""task labels

Revision ID: 0013_task_labels
Revises: 0012_kanban_boards
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0013_task_labels"
down_revision = "0012_kanban_boards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create task_labels table
    op.create_table(
        "task_labels",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # Create task_label_assignments junction table
    op.create_table(
        "task_label_assignments",
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label_id", UUID(as_uuid=True), sa.ForeignKey("task_labels.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("task_id", "label_id"),
    )

    op.create_index("ix_task_label_assignments_task_id", "task_label_assignments", ["task_id"])
    op.create_index("ix_task_label_assignments_label_id", "task_label_assignments", ["label_id"])

    # Insert default labels
    op.execute("""
        INSERT INTO task_labels (name, color) VALUES
        ('Bug', '#ef4444'),
        ('Feature', '#3b82f6'),
        ('Improvement', '#8b5cf6'),
        ('Documentation', '#6b7280'),
        ('Urgent', '#f97316'),
        ('Question', '#06b6d4')
    """)


def downgrade() -> None:
    op.drop_index("ix_task_label_assignments_label_id", table_name="task_label_assignments")
    op.drop_index("ix_task_label_assignments_task_id", table_name="task_label_assignments")
    op.drop_table("task_label_assignments")
    op.drop_table("task_labels")
