"""Add task_subtasks table and task_id FK to work_logs

Revision ID: 0007_subtasks_and_worklog_task
Revises: 0006_notifications
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0007_subtasks_and_worklog_task'
down_revision = '0006_notifications'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add task_id nullable FK column to work_logs
    op.add_column(
        'work_logs',
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_work_logs_task_id',
        'work_logs', 'tasks',
        ['task_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_work_logs_task_id', 'work_logs', ['task_id'])

    # 2. Create task_subtasks table
    op.create_table(
        'task_subtasks',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()'),
        ),
        sa.Column(
            'task_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('tasks.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('is_completed', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_task_subtasks_task_id', 'task_subtasks', ['task_id'])


def downgrade() -> None:
    op.drop_index('ix_task_subtasks_task_id', table_name='task_subtasks')
    op.drop_table('task_subtasks')

    op.drop_index('ix_work_logs_task_id', table_name='work_logs')
    op.drop_constraint('fk_work_logs_task_id', 'work_logs', type_='foreignkey')
    op.drop_column('work_logs', 'task_id')
