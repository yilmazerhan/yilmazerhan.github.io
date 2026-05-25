"""
user_teams — many-to-many junction table between users and teams.
Allows a user to belong to multiple teams simultaneously.
"""
import sqlalchemy as sa
from sqlalchemy import Table, Column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

user_teams = Table(
    "user_teams",
    Base.metadata,
    Column(
        "user_id",
        UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "team_id",
        UUID(as_uuid=True),
        sa.ForeignKey("teams.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
