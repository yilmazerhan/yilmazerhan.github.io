import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, Table, Column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


# Association table for task ↔ label many-to-many
task_label_assignments = Table(
    "task_label_assignments",
    Base.metadata,
    Column("task_id", UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("label_id", UUID(as_uuid=True), ForeignKey("task_labels.id", ondelete="CASCADE"), primary_key=True),
)


class TaskLabel(Base):
    __tablename__ = "task_labels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])  # type: ignore[name-defined]
    tasks: Mapped[list["Task"]] = relationship(  # type: ignore[name-defined]
        "Task", secondary=task_label_assignments, back_populates="labels"
    )
