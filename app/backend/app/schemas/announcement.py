import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    title_en: Optional[str] = Field(None, max_length=500)
    message: str = Field(..., min_length=1, max_length=10000)
    message_en: Optional[str] = Field(None, max_length=10000)
    type: str = "info"
    target_type: str = "all"
    target_ids: Optional[list[uuid.UUID]] = None
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
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    title_en: Optional[str] = Field(None, max_length=500)
    message: Optional[str] = Field(None, min_length=1, max_length=10000)
    message_en: Optional[str] = Field(None, max_length=10000)
    type: Optional[str] = None
    target_type: Optional[str] = None
    target_ids: Optional[list[uuid.UUID]] = None
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
