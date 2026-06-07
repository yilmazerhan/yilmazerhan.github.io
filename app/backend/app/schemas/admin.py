import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class SslCertificateResponse(BaseModel):
    id: uuid.UUID
    name: str
    expires_at: datetime
    is_active: bool
    uploaded_by: Optional[uuid.UUID]
    created_at: datetime
    model_config = {"from_attributes": True}


class BrandingResponse(BaseModel):
    company_name: str
    company_logo: str
    primary_color: str
    jira_base_url: str


class BrandingUpdate(BaseModel):
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    primary_color: Optional[str] = Field(None, max_length=7)
    jira_base_url: Optional[str] = Field(None, max_length=500)

    @field_validator("primary_color")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and (not v.startswith("#") or len(v) not in (4, 7)):
            raise ValueError("Renk geçerli bir HEX değeri olmalıdır (örn: #3b82f6).")
        return v


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    username: Optional[str] = None
    action: str
    table_name: str
    record_id: str
    old_data: Optional[dict] = None
    new_data: Optional[dict] = None
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    skip: int
    limit: int


class DashboardStats(BaseModel):
    total_users: int
    active_users: int
    total_tasks: int
    active_tasks: int
    overdue_tasks: int
    worklogs_this_week: int
    emails_sent_today: int
    emails_failed_today: int


class ReportScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    frequency: str  # daily, weekly, monthly
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    hour: int = 8
    recipient_emails: list[str] = []
    team_id: Optional[uuid.UUID] = None
    user_id: Optional[uuid.UUID] = None
    date_range_days: int = 7
    is_active: bool = True

class ReportScheduleUpdate(BaseModel):
    name: Optional[str] = None
    frequency: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    hour: Optional[int] = None
    recipient_emails: Optional[list[str]] = None
    team_id: Optional[uuid.UUID] = None
    user_id: Optional[uuid.UUID] = None
    date_range_days: Optional[int] = None
    is_active: Optional[bool] = None

class ReportScheduleResponse(BaseModel):
    id: uuid.UUID
    name: str
    frequency: str
    day_of_week: Optional[int]
    day_of_month: Optional[int]
    hour: int
    recipient_emails: list[str]
    team_id: Optional[uuid.UUID]
    user_id: Optional[uuid.UUID]
    date_range_days: int
    is_active: bool
    created_by: Optional[uuid.UUID]
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    created_at: datetime
    model_config = {"from_attributes": True}
