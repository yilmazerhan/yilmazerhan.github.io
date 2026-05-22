"""Initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2025-05-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # teams table must be created before users (FK: users.team_id → teams.id)
    op.create_table('teams',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('manager_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('superadmin', 'team_manager', 'user', name='user_role'), nullable=False, server_default='user'),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('preferred_language', sa.String(10), nullable=False, server_default='tr'),
        sa.Column('preferred_theme', sa.Enum('light', 'dark', name='theme_preference'), nullable=False, server_default='light'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('is_deleted', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # Add manager_id FK now that users table exists
    op.create_foreign_key('fk_teams_manager_id', 'teams', 'users', ['manager_id'], ['id'], ondelete='SET NULL')

    op.create_table('refresh_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('token_hash', sa.String(255), nullable=False, unique=True, index=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )

    op.create_table('password_reset_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('token_hash', sa.String(255), nullable=False, unique=True, index=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )

    op.create_table('permission_overrides',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('module', sa.Enum('worklog', 'kanban', 'user_management', 'email_workflows', 'jira_config', 'ssl_management', 'branding', name='permission_module'), nullable=False),
        sa.Column('action', sa.Enum('create', 'edit', 'delete', 'view', name='permission_action'), nullable=False),
        sa.Column('is_allowed', sa.Boolean, nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'module', 'action', name='uq_permission_user_module_action'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_table('work_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('color', sa.String(7), nullable=False, server_default="'#6366f1'"),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_table('work_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('work_type_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('log_date', sa.Date, nullable=False),
        sa.Column('duration_hours', sa.Numeric(4, 2), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['work_type_id'], ['work_types.id'], ondelete='RESTRICT'),
    )
    op.create_index('ix_work_logs_user_date', 'work_logs', ['user_id', 'log_date'])
    op.create_index('ix_work_logs_log_date', 'work_logs', ['log_date'])

    op.create_table('kanban_columns',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('color', sa.String(7), nullable=False, server_default="'#e2e8f0'"),
        sa.Column('sort_order', sa.Integer, nullable=False),
        sa.Column('is_terminal', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('assignee_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('column_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('priority', sa.Enum('low', 'medium', 'high', 'critical', name='task_priority'), nullable=False, server_default='medium'),
        sa.Column('due_date', sa.Date, nullable=True),
        sa.Column('jira_ticket', sa.String(50), nullable=True),
        sa.Column('jira_status', sa.String(100), nullable=True),
        sa.Column('jira_status_updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('is_archived', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['column_id'], ['kanban_columns.id'], ondelete='RESTRICT'),
    )
    op.create_index('ix_tasks_assignee_id', 'tasks', ['assignee_id'])
    op.create_index('ix_tasks_column_sort', 'tasks', ['column_id', 'sort_order'])
    op.create_index('ix_tasks_due_date', 'tasks', ['due_date'])

    op.create_table('jira_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('base_url', sa.String(500), nullable=False),
        sa.Column('api_token_encrypted', sa.Text, nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('project_key', sa.String(50), nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_table('smtp_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('host', sa.String(255), nullable=False),
        sa.Column('port', sa.Integer, nullable=False, server_default='587'),
        sa.Column('username', sa.String(255), nullable=False),
        sa.Column('password_encrypted', sa.Text, nullable=False),
        sa.Column('use_tls', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('from_email', sa.String(255), nullable=False),
        sa.Column('from_name', sa.String(100), nullable=False, server_default="'Team App'"),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('email_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('slug', sa.String(100), nullable=False, unique=True),
        sa.Column('subject', sa.String(500), nullable=False),
        sa.Column('html_body', sa.Text, nullable=False),
        sa.Column('available_vars', postgresql.JSONB, nullable=True),
        sa.Column('is_system', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_email_templates_slug', 'email_templates', ['slug'], unique=True)

    op.create_table('teams_webhook_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('webhook_url_encrypted', sa.Text, nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_table('email_workflows',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('trigger_type', sa.Enum(
            'task_due_soon', 'task_overdue', 'task_status_changed', 'worklog_reminder',
            'task_assigned', 'account_activation', 'password_reset', name='email_trigger_type'
        ), nullable=False),
        sa.Column('trigger_config', postgresql.JSONB, nullable=True),
        sa.Column('condition_config', postgresql.JSONB, nullable=True),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('recipient_type', sa.Enum(
            'assignee', 'team_manager', 'all_managers', 'specific_users', 'creator', name='recipient_type'
        ), nullable=False, server_default='assignee'),
        sa.Column('recipient_users', postgresql.JSONB, nullable=True),
        sa.Column('send_teams', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('teams_webhook_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['template_id'], ['email_templates.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['teams_webhook_id'], ['teams_webhook_configs.id'], ondelete='SET NULL'),
    )

    op.create_table('email_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('recipient_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('to_email', sa.String(255), nullable=False),
        sa.Column('subject', sa.String(500), nullable=False),
        sa.Column('status', sa.Enum('pending', 'sent', 'failed', name='email_status'), nullable=False, server_default='pending', index=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), index=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workflow_id'], ['email_workflows.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['template_id'], ['email_templates.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['recipient_id'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_table('ssl_certificates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('cert_pem', sa.LargeBinary, nullable=False),
        sa.Column('key_pem_encrypted', sa.Text, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('uploaded_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_table('app_settings',
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('value', sa.Text, nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('key'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_table('audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action', sa.Enum('create', 'update', 'delete', name='audit_action'), nullable=False),
        sa.Column('table_name', sa.String(100), nullable=False),
        sa.Column('record_id', sa.String(100), nullable=False),
        sa.Column('old_data', postgresql.JSONB, nullable=True),
        sa.Column('new_data', postgresql.JSONB, nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_audit_logs_table_record', 'audit_logs', ['table_name', 'record_id'])
    op.create_index('ix_audit_logs_user_created', 'audit_logs', ['user_id', 'created_at'])


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('app_settings')
    op.drop_table('ssl_certificates')
    op.drop_table('email_logs')
    op.drop_table('email_workflows')
    op.drop_table('teams_webhook_configs')
    op.drop_table('email_templates')
    op.drop_table('smtp_configs')
    op.drop_table('jira_configs')
    op.drop_table('tasks')
    op.drop_table('kanban_columns')
    op.drop_table('work_logs')
    op.drop_table('work_types')
    op.drop_table('permission_overrides')
    op.drop_table('password_reset_tokens')
    op.drop_table('refresh_tokens')
    op.drop_constraint('fk_teams_manager_id', 'teams', type_='foreignkey')
    op.drop_table('users')
    op.drop_table('teams')
    for enum_name in ['user_role', 'theme_preference', 'permission_module', 'permission_action',
                      'task_priority', 'email_trigger_type', 'recipient_type', 'email_status', 'audit_action']:
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
