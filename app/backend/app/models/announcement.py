import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    title_en: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    message_en: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(
        SAEnum("info", "warning", "error", "success", name="announcement_type"),
        nullable=False, default="info",
    )
    target_type: Mapped[str] = mapped_column(
        SAEnum("all", "specific_teams", "specific_users", name="announcement_target_type"),
        nullable=False, default="all",
    )
    target_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
