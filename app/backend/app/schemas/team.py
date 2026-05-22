import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    manager_id: Optional[uuid.UUID] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    manager_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class AddMemberRequest(BaseModel):
    user_id: uuid.UUID


class ManagerBasic(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    model_config = {"from_attributes": True}


class MemberBasic(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str
    is_active: bool
    model_config = {"from_attributes": True}


class TeamResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    manager_id: Optional[uuid.UUID]
    manager: Optional[ManagerBasic]
    is_active: bool
    member_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamDetailResponse(TeamResponse):
    members: list[MemberBasic] = []


class TeamListResponse(BaseModel):
    items: list[TeamResponse]
    total: int
