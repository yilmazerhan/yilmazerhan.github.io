"""Add task_attachments, start_date on tasks, report_schedules

Revision ID: 0008_attachments_and_gantt
Revises: 0007_subtasks_and_worklog_task
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0008_attachments_and_gantt'
down_revision = '0007_subtasks_and_worklog_task'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add start_date to tasks
    op.add_column('tasks', sa.Column('start_date', sa.Date(), nullable=True))

    # 2. Create task_attachments table
    op.create_table(
        'task_attachments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(500), nullable=False),          # stored filename (uuid-based)
        sa.Column('original_filename', sa.String(255), nullable=False), # user-visible name
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('uploaded_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_task_attachments_task_id', 'task_attachments', ['task_id'])

    # 3. Create report_schedules table
    op.create_table(
        'report_schedules',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('frequency', sa.String(20), nullable=False),  # daily, weekly, monthly
        sa.Column('day_of_week', sa.Integer(), nullable=True),   # 0=Mon..6=Sun for weekly
        sa.Column('day_of_month', sa.Integer(), nullable=True),  # 1-31 for monthly
        sa.Column('hour', sa.Integer(), nullable=False, server_default='8'),
        sa.Column('recipient_emails', postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('teams.id', ondelete='SET NULL'), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('date_range_days', sa.Integer(), nullable=False, server_default='7'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

def downgrade() -> None:
    op.drop_table('report_schedules')
    op.drop_index('ix_task_attachments_task_id', table_name='task_attachments')
    op.drop_table('task_attachments')
    op.drop_column('tasks', 'start_date')
