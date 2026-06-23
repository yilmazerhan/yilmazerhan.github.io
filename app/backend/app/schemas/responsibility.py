import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    color: str = Field('#6366f1', pattern=r'^#[0-9a-fA-F]{6}$')
    display_order: int = Field(0, ge=0)


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r'^#[0-9a-fA-F]{6}$')
    display_order: Optional[int] = Field(None, ge=0)


class MemberCreate(BaseModel):
    user_id: uuid.UUID
    modules: list[str] = Field(default_factory=list)


class MemberUpdate(BaseModel):
    modules: list[str]


class UserBasic(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    model_config = {"from_attributes": True}


class MemberResponse(BaseModel):
    id: uuid.UUID
    user: UserBasic
    modules: list[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class GroupResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    color: str
    display_order: int
    members: list[MemberResponse]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
