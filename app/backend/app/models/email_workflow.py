import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class EmailWorkflow(Base):
    __tablename__ = "email_workflows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    trigger_type: Mapped[str] = mapped_column(
        SAEnum(
            "task_due_soon",
            "task_overdue",
            "task_status_changed",
            "worklog_reminder",
            "task_assigned",
            "account_activation",
            "password_reset",
            name="email_trigger_type",
        ),
        nullable=False,
    )
    trigger_config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    condition_config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("email_templates.id", ondelete="RESTRICT"), nullable=False
    )
    recipient_type: Mapped[str] = mapped_column(
        SAEnum(
            "assignee",
            "team_manager",
            "all_managers",
            "specific_users",
            "creator",
            name="recipient_type",
        ),
        nullable=False,
        default="assignee",
    )
    recipient_users: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    send_teams: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    teams_webhook_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams_webhook_configs.id", ondelete="SET NULL"), nullable=True
    )
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    template: Mapped["EmailTemplate"] = relationship("EmailTemplate", back_populates="workflows")
    logs: Mapped[list["EmailLog"]] = relationship("EmailLog", back_populates="workflow")
