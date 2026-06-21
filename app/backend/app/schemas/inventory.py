import ipaddress
import uuid
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


VALID_ITEM_TYPES = ["server", "database", "email_account", "cloud_account", "generic"]
VALID_FREQUENCIES = ["daily", "weekly", "monthly"]
VALID_GROUP_TYPES = ["replication", "cluster", "ha", "load_balanced", "related", "other"]


# ── Group schemas ─────────────────────────────────────────────────────────────

class InventoryGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    group_type: str = Field("related")
    color: str = Field("#6366f1")


class InventoryGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    group_type: Optional[str] = None
    color: Optional[str] = None


class InventoryGroupSummary(BaseModel):
    id: uuid.UUID
    name: str
    group_type: str
    color: str
    model_config = ConfigDict(from_attributes=True)


class InventoryGroupResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    group_type: str
    color: str
    item_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class InventoryGroupAssign(BaseModel):
    item_ids: list[uuid.UUID]


# ── Item schemas ──────────────────────────────────────────────────────────────

class InventoryItemCreate(BaseModel):
    item_type: Literal["server", "database", "email_account", "cloud_account", "generic"]
    display_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    notes: Optional[str] = Field(None, max_length=5000)
    owner: Optional[str] = Field(None, max_length=255)
    tags: list[str] = Field(default_factory=list)
    is_active: bool = True

    # Server / DB / shared
    hostname: Optional[str] = Field(None, max_length=255)
    ip_address: Optional[str] = Field(None, max_length=45)
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = None          # plaintext → encrypted in service
    ssh_key: Optional[str] = None           # plaintext → encrypted in service
    operating_system: Optional[str] = Field(None, max_length=100)

    # Database-specific
    database_name: Optional[str] = Field(None, max_length=255)
    database_type: Optional[str] = Field(None, max_length=50)

    # Email account
    email_address: Optional[str] = Field(None, max_length=255)
    smtp_host: Optional[str] = Field(None, max_length=255)
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    imap_host: Optional[str] = Field(None, max_length=255)
    imap_port: Optional[int] = Field(None, ge=1, le=65535)

    # Cloud account
    provider: Optional[str] = Field(None, max_length=50)
    account_id: Optional[str] = Field(None, max_length=255)
    access_key_id: Optional[str] = None    # plaintext → encrypted
    secret_access_key: Optional[str] = None  # plaintext → encrypted
    region: Optional[str] = Field(None, max_length=100)

    # Generic
    url: Optional[str] = Field(None, max_length=1000)

    # Group assignment
    group_id: Optional[uuid.UUID] = None

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError("Geçersiz IP adresi.")
        return v

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        if not (v.startswith("http://") or v.startswith("https://") or "://" in v):
            raise ValueError("Geçersiz URL.")
        return v


class InventoryItemUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    notes: Optional[str] = Field(None, max_length=5000)
    owner: Optional[str] = Field(None, max_length=255)
    tags: Optional[list[str]] = None
    is_active: Optional[bool] = None

    hostname: Optional[str] = Field(None, max_length=255)
    ip_address: Optional[str] = Field(None, max_length=45)
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    operating_system: Optional[str] = Field(None, max_length=100)

    database_name: Optional[str] = Field(None, max_length=255)
    database_type: Optional[str] = Field(None, max_length=50)

    email_address: Optional[str] = Field(None, max_length=255)
    smtp_host: Optional[str] = Field(None, max_length=255)
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    imap_host: Optional[str] = Field(None, max_length=255)
    imap_port: Optional[int] = Field(None, ge=1, le=65535)

    provider: Optional[str] = Field(None, max_length=50)
    account_id: Optional[str] = Field(None, max_length=255)
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None
    region: Optional[str] = Field(None, max_length=100)

    url: Optional[str] = Field(None, max_length=1000)

    # Group assignment (None = remove from group)
    group_id: Optional[uuid.UUID] = None

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError("Geçersiz IP adresi.")
        return v


class InventoryItemResponse(BaseModel):
    id: uuid.UUID
    item_type: str
    display_name: str
    description: Optional[str] = None
    notes: Optional[str] = None
    owner: Optional[str] = None
    tags: list[str] = []
    is_active: bool

    # Server / shared
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    has_password: bool = False
    has_ssh_key: bool = False
    operating_system: Optional[str] = None

    # Database
    database_name: Optional[str] = None
    database_type: Optional[str] = None

    # Email
    email_address: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None

    # Cloud
    provider: Optional[str] = None
    account_id: Optional[str] = None
    has_access_key: bool = False
    region: Optional[str] = None

    # Generic
    url: Optional[str] = None

    # Group
    group_id: Optional[uuid.UUID] = None
    group: Optional[InventoryGroupSummary] = None

    created_by: Optional[uuid.UUID] = None
    updated_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InventoryRevealRequest(BaseModel):
    field: Literal["password", "ssh_key", "access_key_id", "secret_access_key"]


class InventoryRevealResponse(BaseModel):
    field: str
    value: str


# ── Schedule schemas ──────────────────────────────────────────────────────────

class InventoryScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    frequency: Literal["daily", "weekly", "monthly"] = "weekly"
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    hour: int = Field(8, ge=0, le=23)
    recipient_emails: list[str] = Field(..., min_length=1)
    is_active: bool = True
    teams_webhook_id: Optional[uuid.UUID] = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "InventoryScheduleCreate":
        if self.frequency == "weekly" and self.day_of_week is None:
            raise ValueError("Haftalık sıklık için haftanın günü belirtilmelidir.")
        if self.frequency == "monthly" and self.day_of_month is None:
            raise ValueError("Aylık sıklık için ayın günü belirtilmelidir.")
        return self


class InventoryScheduleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    hour: Optional[int] = Field(None, ge=0, le=23)
    recipient_emails: Optional[list[str]] = None
    is_active: Optional[bool] = None
    teams_webhook_id: Optional[uuid.UUID] = None


class InventoryScheduleResponse(BaseModel):
    id: uuid.UUID
    name: str
    frequency: str
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    hour: int
    recipient_emails: list[str]
    is_active: bool
    teams_webhook_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
