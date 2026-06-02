import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class CustomerResponse(BaseModel):
    id: uuid.UUID
    name: str
    model_config = ConfigDict(from_attributes=True)


class PatchCreate(BaseModel):
    customers: list[str] = Field(..., min_length=1)
    jira_ticket: Optional[str] = None
    app_version: str
    apply_date: date
    environment: Optional[str] = None
    status: str = "applied"
    description: Optional[str] = None


class PatchUpdate(BaseModel):
    customers: Optional[list[str]] = None
    jira_ticket: Optional[str] = None
    app_version: Optional[str] = None
    apply_date: Optional[date] = None
    environment: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None


class PatchUserInfo(BaseModel):
    id: uuid.UUID
    full_name: str

    model_config = ConfigDict(from_attributes=True)


class PatchResponse(BaseModel):
    id: uuid.UUID
    customers: list[str] = []
    jira_ticket: Optional[str] = None
    app_version: str
    apply_date: date
    environment: Optional[str] = None
    status: str
    description: Optional[str] = None
    created_by: Optional[uuid.UUID] = None
    created_by_user: Optional[PatchUserInfo] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PatchListResponse(BaseModel):
    items: list[PatchResponse]
    total: int
    skip: int
    limit: int
