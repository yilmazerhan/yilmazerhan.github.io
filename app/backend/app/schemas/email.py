import uuid
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, EmailStr, Field, field_validator


class SmtpConfigCreate(BaseModel):
    host: str = Field(..., max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    username: str = Field(..., max_length=255)
    password: str = Field(..., max_length=4096)
    use_tls: bool = True
    use_ssl: bool = False
    from_email: EmailStr
    from_name: str = Field(default="Team App", max_length=100)


class SmtpConfigUpdate(BaseModel):
    host: Optional[str] = Field(None, max_length=255)
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = Field(None, max_length=4096)
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None


class SmtpConfigResponse(BaseModel):
    id: uuid.UUID
    host: str
    port: int
    username: str
    use_tls: bool
    use_ssl: bool = False
    from_email: str
    from_name: str
    is_active: bool
    model_config = {"from_attributes": True}


class EmailTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100)
    subject: str = Field(..., min_length=1, max_length=500)
    html_body: str = Field(..., min_length=1, max_length=200000)
    available_vars: Optional[dict] = None


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    subject: Optional[str] = Field(None, min_length=1, max_length=500)
    html_body: Optional[str] = Field(None, min_length=1, max_length=200000)
    available_vars: Optional[dict] = None


class EmailTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    subject: str
    html_body: str
    available_vars: Optional[dict]
    is_system: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class EmailTemplatePreviewRequest(BaseModel):
    variables: dict = {}


class EmailWorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    trigger_type: str
    template_id: uuid.UUID
    recipient_type: str
    trigger_config: Optional[dict] = None
    condition_config: Optional[dict] = None
    # Holds user UUIDs (specific_users) or email strings (specific_emails); stored as JSONB.
    recipient_users: Optional[list[str]] = None
    send_teams: bool = False
    teams_webhook_id: Optional[uuid.UUID] = None

    @field_validator("trigger_type")
    @classmethod
    def validate_trigger(cls, v: str) -> str:
        allowed = {"task_due_soon", "task_overdue", "task_status_changed", "worklog_reminder", "task_assigned", "account_activation", "password_reset", "dashboard_report"}
        if v not in allowed:
            raise ValueError(f"Geçersiz trigger tipi. İzin verilenler: {', '.join(sorted(allowed))}")
        return v

    @field_validator("recipient_type")
    @classmethod
    def validate_recipient(cls, v: str) -> str:
        allowed = {"assignee", "team_manager", "all_managers", "specific_users", "creator", "specific_emails", "all_users"}
        if v not in allowed:
            raise ValueError(f"Geçersiz alıcı tipi.")
        return v


class EmailWorkflowUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    trigger_config: Optional[dict] = None
    condition_config: Optional[dict] = None
    template_id: Optional[uuid.UUID] = None
    recipient_type: Optional[str] = None
    recipient_users: Optional[list[str]] = None
    send_teams: Optional[bool] = None
    teams_webhook_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class EmailWorkflowResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    trigger_type: str
    trigger_config: Optional[dict]
    condition_config: Optional[dict]
    template_id: uuid.UUID
    recipient_type: str
    recipient_users: Optional[list]
    send_teams: bool
    teams_webhook_id: Optional[uuid.UUID]
    last_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class EmailLogResponse(BaseModel):
    id: uuid.UUID
    workflow_id: Optional[uuid.UUID]
    template_id: Optional[uuid.UUID]
    recipient_id: Optional[uuid.UUID]
    to_email: str
    subject: str
    status: str
    error_message: Optional[str]
    sent_at: Optional[datetime]
    created_at: datetime
    model_config = {"from_attributes": True}


class EmailLogListResponse(BaseModel):
    items: list[EmailLogResponse]
    total: int
    skip: int
    limit: int


class TeamsWebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    webhook_url: str = Field(..., max_length=2000)

    @field_validator("webhook_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("Webhook URL https:// ile başlamalıdır.")
        return v


class TeamsWebhookUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    webhook_url: Optional[str] = Field(None, max_length=2000)
    is_active: Optional[bool] = None


class TeamsWebhookResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}
