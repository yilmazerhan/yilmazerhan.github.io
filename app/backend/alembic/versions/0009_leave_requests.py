"""Add leave_requests table

Revision ID: 0009_leave_requests
Revises: 0008_attachments_and_gantt
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0009_leave_requests'
down_revision = '0008_attachments_and_gantt'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'leave_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('reviewed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_leave_requests_user_id', 'leave_requests', ['user_id'])
    op.create_index('ix_leave_requests_start_end_date', 'leave_requests', ['start_date', 'end_date'])


def downgrade() -> None:
    op.drop_index('ix_leave_requests_start_end_date', table_name='leave_requests')
    op.drop_index('ix_leave_requests_user_id', table_name='leave_requests')
    op.drop_table('leave_requests')
