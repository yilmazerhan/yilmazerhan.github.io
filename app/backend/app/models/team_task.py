import uuid
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import String, Text, Date, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class TeamTaskAssignee(Base):
    __tablename__ = "team_task_assignees"

    team_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_tasks.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Loaded via JOIN so it's always available without a separate query
    user: Mapped["User"] = relationship("User", lazy="joined")

    # Properties so Pydantic can serialize this as TeamTaskAssigneeInfo
    @property
    def id(self) -> uuid.UUID:
        return self.user_id

    @property
    def full_name(self) -> str:
        return self.user.full_name

    @property
    def email(self) -> str:
        return self.user.email


class TeamTask(Base):
    __tablename__ = "team_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    deadline: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reminder_days_before: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    # Returns TeamTaskAssignee objects (not User objects) — includes completed_at
    assignees: Mapped[List["TeamTaskAssignee"]] = relationship(
        "TeamTaskAssignee",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
