"""Add releases, release_phases, release_milestones tables

Revision ID: 0035_releases
Revises: 0034_responsibility
Create Date: 2026-06-23 00:00:00.000001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0035_releases'
down_revision = '0034_responsibility'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'releases',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('display_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_table(
        'release_phases',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('release_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('releases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('start_date', sa.Date, nullable=False),
        sa.Column('end_date', sa.Date, nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default=sa.text("'not_started'")),
        sa.Column('display_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_release_phases_release_id', 'release_phases', ['release_id'])
    op.create_table(
        'release_milestones',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('release_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('releases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(30), nullable=False),
        sa.Column('date', sa.Date, nullable=False),
        sa.Column('label', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_release_milestones_release_id', 'release_milestones', ['release_id'])


def downgrade() -> None:
    op.drop_table('release_milestones')
    op.drop_table('release_phases')
    op.drop_table('releases')
