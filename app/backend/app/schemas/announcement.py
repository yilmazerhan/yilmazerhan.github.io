import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class AnnouncementCreate(BaseModel):
    title: str
    title_en: Optional[str] = None
    message: str
    message_en: Optional[str] = None
    type: str = "info"
    target_type: str = "all"
    target_ids: Optional[list] = None
    starts_at: datetime
    ends_at: Optional[datetime] = None
    is_active: bool = True

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        allowed = {"info", "warning", "error", "success"}
        if v not in allowed:
            raise ValueError(f"Geçersiz tür. İzin verilenler: {', '.join(sorted(allowed))}")
        return v

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        allowed = {"all", "specific_teams", "specific_users"}
        if v not in allowed:
            raise ValueError(f"Geçersiz hedef tipi.")
        return v


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    title_en: Optional[str] = None
    message: Optional[str] = None
    message_en: Optional[str] = None
    type: Optional[str] = None
    target_type: Optional[str] = None
    target_ids: Optional[list] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: Optional[bool] = None


class AnnouncementResponse(BaseModel):
    id: uuid.UUID
    title: str
    title_en: Optional[str]
    message: str
    message_en: Optional[str]
    type: str
    target_type: str
    target_ids: Optional[list]
    starts_at: datetime
    ends_at: Optional[datetime]
    is_active: bool
    created_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
