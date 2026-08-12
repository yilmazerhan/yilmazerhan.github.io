"""Add responsibility_groups and responsibility_members tables

Revision ID: 0034_responsibility
Revises: 0033
Create Date: 2026-06-23 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0034_responsibility'
down_revision = '0033'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'responsibility_groups',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('color', sa.String(20), nullable=False, server_default=sa.text("'#6366f1'")),
        sa.Column('display_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_table(
        'responsibility_members',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('group_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('responsibility_groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('modules', postgresql.JSONB, nullable=False,
                  server_default=sa.text("'[]'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_responsibility_members_group_id', 'responsibility_members', ['group_id'])
    op.create_unique_constraint(
        'uq_responsibility_members_group_user',
        'responsibility_members',
        ['group_id', 'user_id'],
    )


def downgrade() -> None:
    op.drop_table('responsibility_members')
    op.drop_table('responsibility_groups')
