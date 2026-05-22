import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class PermissionOverride(Base):
    __tablename__ = "permission_overrides"
    __table_args__ = (UniqueConstraint("user_id", "module", "action", name="uq_permission_user_module_action"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    module: Mapped[str] = mapped_column(
        SAEnum(
            "worklog",
            "kanban",
            "user_management",
            "email_workflows",
            "jira_config",
            "ssl_management",
            "branding",
            name="permission_module",
        ),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(
        SAEnum("create", "edit", "delete", "view", name="permission_action"),
        nullable=False,
    )
    is_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="permission_overrides", foreign_keys=[user_id])
