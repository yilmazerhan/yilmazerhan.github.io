import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class WorkTypeCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    sort_order: int = 0

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("Renk geçerli bir HEX değeri olmalıdır (örn: #3b82f6).")
        return v


class WorkTypeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class WorkTypeResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    is_active: bool
    sort_order: int
    model_config = {"from_attributes": True}


class WorkLogCreate(BaseModel):
    work_type_id: uuid.UUID
    log_date: date
    duration_hours: float
    description: str

    @field_validator("duration_hours")
    @classmethod
    def validate_duration(cls, v: float) -> float:
        if not (0.25 <= v <= 24):
            raise ValueError("Süre 0.25 ile 24 saat arasında olmalıdır.")
        # Round to nearest 0.25
        return round(v * 4) / 4

    @field_validator("description")
    @classmethod
    def validate_desc(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("Açıklama en az 5 karakter olmalıdır.")
        return v


class WorkLogUpdate(BaseModel):
    work_type_id: Optional[uuid.UUID] = None
    log_date: Optional[date] = None
    duration_hours: Optional[float] = None
    description: Optional[str] = None


class UserBasic(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    model_config = {"from_attributes": True}


class WorkLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user: UserBasic
    work_type_id: uuid.UUID
    work_type: WorkTypeResponse
    log_date: date
    duration_hours: float
    description: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class WorkLogListResponse(BaseModel):
    items: list[WorkLogResponse]
    total: int
    skip: int
    limit: int


class WorkLogSummary(BaseModel):
    by_type: list[dict]
    total_hours: float
