import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class LeaveRequestCreate(BaseModel):
    start_date: date
    end_date: date
    reason: Optional[str] = None


class LeaveRequestUpdate(BaseModel):
    status: Optional[str] = None  # approved/rejected/cancelled
    review_note: Optional[str] = None


class LeaveUserInfo(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    model_config = ConfigDict(from_attributes=True)


class LeaveRequestResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user: LeaveUserInfo
    start_date: date
    end_date: date
    reason: Optional[str]
    status: str
    reviewed_by: Optional[uuid.UUID]
    reviewer: Optional[LeaveUserInfo]
    review_note: Optional[str]
    reviewed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
