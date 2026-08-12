import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class JiraConfigCreate(BaseModel):
    name: str
    base_url: str
    email: str
    api_token: str
    project_key: str

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("Base URL https:// ile başlamalıdır.")
        return v.rstrip("/")


class JiraConfigUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    email: Optional[str] = None
    api_token: Optional[str] = None
    project_key: Optional[str] = None
    is_active: Optional[bool] = None


class JiraConfigResponse(BaseModel):
    id: uuid.UUID
    name: str
    base_url: str
    email: str
    project_key: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class JiraConnectionTestResponse(BaseModel):
    success: bool
    project_name: Optional[str] = None
    error: Optional[str] = None
