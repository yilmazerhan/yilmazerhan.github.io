"""repair user_teams: re-sync from users.team_id and teams.manager_id

Revision ID: 0023_repair_user_teams
Revises: 0022_customer_patches
Create Date: 2026-06-02

When team assignments were made via user_service.update_user() before the
junction-table sync fix, the user_teams table was not updated. This migration
re-inserts any missing rows so team-scoped queries work correctly for all
existing users.
"""

from alembic import op

revision = "0023_repair_user_teams"
down_revision = "0022_customer_patches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Re-add any users whose team_id was set after migration 0014 via the old
    # user_service path that did not sync the junction table.
    op.execute("""
        INSERT INTO user_teams (user_id, team_id)
        SELECT id, team_id
        FROM users
        WHERE team_id IS NOT NULL
          AND is_deleted = FALSE
        ON CONFLICT DO NOTHING
    """)

    # Also ensure every team manager listed in teams.manager_id has a row in
    # user_teams for their own team (covers the teams.update_team edge case).
    op.execute("""
        INSERT INTO user_teams (user_id, team_id)
        SELECT manager_id, id
        FROM teams
        WHERE manager_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    # Data repairs are intentionally not reversed.
    pass
