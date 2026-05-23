import uuid
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Boolean, Text, Date, DateTime, ForeignKey, Integer, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class KanbanColumn(Base):
    __tablename__ = "kanban_columns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#e2e8f0")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_terminal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="column")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assignee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    column_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kanban_columns.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    priority: Mapped[str] = mapped_column(
        SAEnum("low", "medium", "high", "critical", name="task_priority"),
        nullable=False,
        default="medium",
    )
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    jira_ticket: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    jira_status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    jira_status_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    assignee: Mapped[Optional["User"]] = relationship("User", back_populates="assigned_tasks", foreign_keys=[assignee_id])
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    column: Mapped["KanbanColumn"] = relationship("KanbanColumn", back_populates="tasks")
    comments: Mapped[list["TaskComment"]] = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan", order_by="TaskComment.created_at")  # type: ignore[name-defined]
    subtasks: Mapped[list["TaskSubtask"]] = relationship("TaskSubtask", back_populates="task", cascade="all, delete-orphan", lazy="selectin", order_by="TaskSubtask.sort_order")  # type: ignore[name-defined]
    work_logs: Mapped[list["WorkLog"]] = relationship("WorkLog", back_populates="task", lazy="selectin")  # type: ignore[name-defined]
