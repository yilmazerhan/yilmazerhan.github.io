import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, BigInteger, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BackupRecord(Base):
    __tablename__ = "backup_records"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, default=0)
    backup_type: Mapped[str] = mapped_column(String(20), default="manual")   # manual | scheduled
    status: Mapped[str] = mapped_column(String(20), default="completed")      # completed | failed
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
