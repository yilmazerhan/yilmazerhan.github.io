"""add name_key to kanban_columns and work_types for i18n

Revision ID: 0011_add_name_key
Revises: 0010_backup_records
Create Date: 2026-05-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0011_add_name_key"
down_revision = "0010_backup_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add name_key to kanban_columns
    op.add_column("kanban_columns", sa.Column("name_key", sa.String(100), nullable=True))

    # Add name_key to work_types
    op.add_column("work_types", sa.Column("name_key", sa.String(100), nullable=True))

    # Update default kanban columns with translation keys
    op.execute("""
        UPDATE kanban_columns SET name_key = 'kanban.col_pending'
        WHERE name = 'Bekleyen' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE kanban_columns SET name_key = 'kanban.col_in_progress'
        WHERE name = 'Devam Ediyor' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE kanban_columns SET name_key = 'kanban.col_in_review'
        WHERE name = 'İncelemede' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE kanban_columns SET name_key = 'kanban.col_done'
        WHERE name = 'Tamamlandı' AND name_key IS NULL
    """)

    # Update default work types with translation keys
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_client_meeting'
        WHERE name = 'Müşteri Toplantısı' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_presentation'
        WHERE name = 'Sunum Hazırlığı' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_bug_review'
        WHERE name = 'Production Bug İncelemesi' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_analysis'
        WHERE name = 'Analiz' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_development'
        WHERE name = 'Geliştirme' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_testing'
        WHERE name = 'Test' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_release_testing'
        WHERE name = 'Release Testi' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_documentation'
        WHERE name = 'Dokümantasyon' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_code_review'
        WHERE name = 'Code Review' AND name_key IS NULL
    """)
    op.execute("""
        UPDATE work_types SET name_key = 'worklog.wt_training'
        WHERE name = 'Eğitim / Araştırma' AND name_key IS NULL
    """)


def downgrade() -> None:
    op.drop_column("work_types", "name_key")
    op.drop_column("kanban_columns", "name_key")
