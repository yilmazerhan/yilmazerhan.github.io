"""user_teams many-to-many junction table

Revision ID: 0014_user_teams
Revises: 0013_task_labels
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0014_user_teams"
down_revision = "0013_task_labels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user_teams junction table
    op.create_table(
        "user_teams",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "team_id"),
    )
    op.create_index("ix_user_teams_user_id", "user_teams", ["user_id"])
    op.create_index("ix_user_teams_team_id", "user_teams", ["team_id"])

    # Populate from existing users.team_id
    op.execute("""
        INSERT INTO user_teams (user_id, team_id)
        SELECT id, team_id FROM users WHERE team_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index("ix_user_teams_team_id", table_name="user_teams")
    op.drop_index("ix_user_teams_user_id", table_name="user_teams")
    op.drop_table("user_teams")
