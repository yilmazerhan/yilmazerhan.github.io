import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


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


class BrandingUpdate(BaseModel):
    company_name: Optional[str] = None
    primary_color: Optional[str] = None


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    action: str
    table_name: str
    record_id: str
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
