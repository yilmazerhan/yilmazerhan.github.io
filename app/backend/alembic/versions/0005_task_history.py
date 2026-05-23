"""Add task_history table

Revision ID: 0005_task_history
Revises: 0004_task_comments
Create Date: 2026-05-23 00:00:00.000002
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0005_task_history'
down_revision = '0004_task_comments'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'task_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('task_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('changed_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('changes', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_task_history_task_id', 'task_history', ['task_id'])
    op.create_index('ix_task_history_created_at', 'task_history', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_task_history_created_at', table_name='task_history')
    op.drop_index('ix_task_history_task_id', table_name='task_history')
    op.drop_table('task_history')
