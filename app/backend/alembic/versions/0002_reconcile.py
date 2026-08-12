"""Reconcile schema with models

Revision ID: 0002_reconcile
Revises: 0001_initial
Create Date: 2025-05-22 00:00:00.000001
"""
from alembic import op

revision = '0002_reconcile'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename theme_type → theme_preference (migration 0001 had wrong name)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'theme_type') THEN
                ALTER TYPE theme_type RENAME TO theme_preference;
            END IF;
        END $$;
    """)

    # Add revoked column to refresh_tokens if missing
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='refresh_tokens' AND column_name='revoked'
            ) THEN
                ALTER TABLE refresh_tokens ADD COLUMN revoked BOOLEAN NOT NULL DEFAULT FALSE;
            END IF;
        END $$;
    """)

    # Remove extra token_type column from refresh_tokens if present
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='refresh_tokens' AND column_name='token_type'
            ) THEN
                ALTER TABLE refresh_tokens DROP COLUMN token_type;
            END IF;
        END $$;
    """)

    # Extend token_hash in refresh_tokens from 64 to 255 chars
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='refresh_tokens' AND column_name='token_hash'
                  AND character_maximum_length IS NOT NULL AND character_maximum_length < 255
            ) THEN
                ALTER TABLE refresh_tokens ALTER COLUMN token_hash TYPE VARCHAR(255);
            END IF;
        END $$;
    """)

    # Rename is_used → used in password_reset_tokens
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='password_reset_tokens' AND column_name='is_used'
            ) THEN
                ALTER TABLE password_reset_tokens RENAME COLUMN is_used TO used;
            END IF;
        END $$;
    """)

    # Remove extra token_type column from password_reset_tokens if present
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='password_reset_tokens' AND column_name='token_type'
            ) THEN
                ALTER TABLE password_reset_tokens DROP COLUMN token_type;
            END IF;
        END $$;
    """)

    # Drop token_type enum (no longer used by any table)
    op.execute("DROP TYPE IF EXISTS token_type;")

    # Fix audit_logs.record_id: UUID → VARCHAR(100)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='audit_logs' AND column_name='record_id' AND data_type = 'uuid'
            ) THEN
                ALTER TABLE audit_logs ALTER COLUMN record_id TYPE VARCHAR(100) USING record_id::text;
            END IF;
        END $$;
    """)

    # Fix audit_logs.ip_address: INET → VARCHAR(45)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='audit_logs' AND column_name='ip_address' AND udt_name = 'inet'
            ) THEN
                ALTER TABLE audit_logs ALTER COLUMN ip_address TYPE VARCHAR(45) USING ip_address::text;
            END IF;
        END $$;
    """)

    # Fix permission_overrides unique constraint name if old name exists
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_permission_override' AND contype = 'u'
            ) THEN
                ALTER TABLE permission_overrides
                    RENAME CONSTRAINT uq_permission_override TO uq_permission_user_module_action;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    pass
