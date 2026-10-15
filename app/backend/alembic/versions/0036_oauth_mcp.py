"""Add OAuth tables for the MCP interface

Revision ID: 0036_oauth_mcp
Revises: 0035_releases
Create Date: 2026-10-15 00:00:00.000001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0036_oauth_mcp'
down_revision = '0035_releases'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'oauth_clients',
        sa.Column('client_id', sa.String(64), primary_key=True),
        sa.Column('client_name', sa.String(200), nullable=False),
        sa.Column('redirect_uris', postgresql.JSONB, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_table(
        'oauth_authorization_codes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('code_hash', sa.String(64), nullable=False),
        sa.Column('client_id', sa.String(64),
                  sa.ForeignKey('oauth_clients.client_id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('redirect_uri', sa.String(2000), nullable=False),
        sa.Column('code_challenge', sa.String(128), nullable=False),
        sa.Column('resource', sa.String(2000), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used', sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_oauth_authorization_codes_code_hash', 'oauth_authorization_codes', ['code_hash'], unique=True)
    op.create_table(
        'oauth_grants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('client_id', sa.String(64),
                  sa.ForeignKey('oauth_clients.client_id', ondelete='CASCADE'), nullable=False),
        sa.Column('client_name', sa.String(200), nullable=False),
        sa.Column('resource', sa.String(2000), nullable=False),
        sa.Column('refresh_token_hash', sa.String(64), nullable=False),
        sa.Column('refresh_expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked', sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_oauth_grants_user_id', 'oauth_grants', ['user_id'])
    op.create_index('ix_oauth_grants_refresh_token_hash', 'oauth_grants', ['refresh_token_hash'], unique=True)


def downgrade() -> None:
    op.drop_table('oauth_grants')
    op.drop_table('oauth_authorization_codes')
    op.drop_table('oauth_clients')
