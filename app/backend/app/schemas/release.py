import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, model_validator


_VALID_STATUSES = ("completed", "on_track", "at_risk", "high_risk", "not_started")
_VALID_MILESTONE_TYPES = ("internal_control", "internal_acceptance", "general_available")


# ─── Phases ────────────────────────────────────────────────────────────────────

class PhaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    start_date: date
    end_date: date
    status: str = "not_started"
    display_order: int = Field(0, ge=0)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in _VALID_STATUSES:
            raise ValueError(f"Durum şunlardan biri olmalıdır: {', '.join(_VALID_STATUSES)}")
        return v

    @model_validator(mode="after")
    def check_dates(self) -> "PhaseCreate":
        if self.end_date < self.start_date:
            raise ValueError("Bitiş tarihi başlangıç tarihinden önce olamaz.")
        return self


class PhaseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None
    display_order: Optional[int] = Field(None, ge=0)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError(f"Durum şunlardan biri olmalıdır: {', '.join(_VALID_STATUSES)}")
        return v


class PhaseResponse(BaseModel):
    id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    status: str
    display_order: int
    model_config = {"from_attributes": True}


# ─── Milestones ────────────────────────────────────────────────────────────────

class MilestoneCreate(BaseModel):
    type: str
    date: date
    label: Optional[str] = Field(None, max_length=255)

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in _VALID_MILESTONE_TYPES:
            raise ValueError(f"Tür şunlardan biri olmalıdır: {', '.join(_VALID_MILESTONE_TYPES)}")
        return v


class MilestoneUpdate(BaseModel):
    type: Optional[str] = None
    date: Optional[date] = None
    label: Optional[str] = Field(None, max_length=255)

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_MILESTONE_TYPES:
            raise ValueError(f"Tür şunlardan biri olmalıdır: {', '.join(_VALID_MILESTONE_TYPES)}")
        return v


class MilestoneResponse(BaseModel):
    id: uuid.UUID
    type: str
    date: date
    label: Optional[str]
    model_config = {"from_attributes": True}


# ─── Releases ──────────────────────────────────────────────────────────────────

class ReleaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=4000)
    display_order: int = Field(0, ge=0)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class ReleaseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    display_order: Optional[int] = Field(None, ge=0)


class ReleaseResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    display_order: int
    phases: list[PhaseResponse]
    milestones: list[MilestoneResponse]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
