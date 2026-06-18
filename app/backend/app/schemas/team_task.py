import uuid
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


_VALID_STATUSES = ("pending", "in_progress", "done")


class UserBasic(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    model_config = {"from_attributes": True}


class TeamTaskAssigneeInfo(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    completed_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class TeamTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=10000)
    deadline: date
    reminder_days_before: int = Field(3, ge=1, le=365)
    assignee_ids: List[uuid.UUID] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return v.strip()


class TeamTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    deadline: Optional[date] = None
    reminder_days_before: Optional[int] = Field(None, ge=1, le=365)
    status: Optional[str] = None
    assignee_ids: Optional[List[uuid.UUID]] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError(f"Durum şunlardan biri olmalıdır: {', '.join(_VALID_STATUSES)}")
        return v


class TeamTaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    deadline: date
    reminder_days_before: int
    status: str
    created_by: Optional[uuid.UUID]
    creator: Optional[UserBasic]
    assignees: List[TeamTaskAssigneeInfo]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
