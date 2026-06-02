import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, Integer, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class InventoryGroup(Base):
    __tablename__ = "inventory_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    group_type: Mapped[str] = mapped_column(String(50), nullable=False, default="related")
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Discriminator — one of: server, database, email_account, cloud_account, generic
    item_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Common fields
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ── Server & Database fields ─────────────────────────────────────────────
    hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # IPv4 or IPv6
    port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ssh_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operating_system: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ── Database-specific fields ─────────────────────────────────────────────
    database_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    database_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # database_type values: PostgreSQL, MySQL, MSSQL, Oracle, Redis, MongoDB, Other

    # ── Email account fields ─────────────────────────────────────────────────
    email_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    smtp_host: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    imap_host: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    imap_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ── Cloud account fields ─────────────────────────────────────────────────
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # provider values: AWS, Azure, GCP, DigitalOcean, Other
    account_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    access_key_id_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    secret_access_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ── Generic / shared fields ──────────────────────────────────────────────
    url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # ── Group ────────────────────────────────────────────────────────────────
    group_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    group: Mapped[Optional["InventoryGroup"]] = relationship(
        "InventoryGroup", foreign_keys=[group_id], lazy="selectin"
    )

    # ── Audit ────────────────────────────────────────────────────────────────
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class InventoryEmailSchedule(Base):
    __tablename__ = "inventory_email_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="weekly")
    # frequency values: daily, weekly, monthly
    day_of_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)   # 0=Mon … 6=Sun
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1–31
    hour: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    recipient_emails: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
