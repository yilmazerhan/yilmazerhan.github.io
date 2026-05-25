import re
import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

_JIRA_RE = re.compile(r'^[A-Za-z][A-Za-z0-9_]*-\d+$')


# ─── Label schemas ────────────────────────────────────────────────────────────

class LabelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = "#6366f1"

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("Renk geçerli bir HEX değeri olmalıdır.")
        return v


class LabelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = None


class LabelResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    created_by: Optional[uuid.UUID]
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Board schemas ────────────────────────────────────────────────────────────

class BoardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    color: str = "#6366f1"

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("Renk geçerli bir HEX değeri olmalıdır.")
        return v


class BoardUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    color: Optional[str] = None
    is_archived: Optional[bool] = None


class BoardResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    color: str
    is_archived: bool
    is_personal: bool = False
    created_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    task_count: int = 0
    column_count: int = 0
    model_config = {"from_attributes": True}


# ─── Column schemas ───────────────────────────────────────────────────────────

class ColumnCreate(BaseModel):
    name: str
    color: str = "#e2e8f0"
    is_terminal: bool = False
    sort_order: int = 0
    board_id: Optional[uuid.UUID] = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("Renk geçerli bir HEX değeri olmalıdır.")
        return v


class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    is_terminal: Optional[bool] = None
    sort_order: Optional[int] = None


class ColumnReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class ColumnResponse(BaseModel):
    id: uuid.UUID
    board_id: uuid.UUID
    name: str
    name_key: Optional[str] = None
    color: str
    is_terminal: bool
    sort_order: int
    model_config = {"from_attributes": True}


class UserBasic(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=500)
    column_id: uuid.UUID
    description: Optional[str] = Field(None, max_length=50000)
    assignee_id: Optional[uuid.UUID] = None
    priority: str = "medium"
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    jira_ticket: Optional[str] = Field(None, max_length=50)
    label_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        if v not in ("low", "medium", "high", "critical"):
            raise ValueError("Öncelik low, medium, high veya critical olmalıdır.")
        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Başlık en az 2 karakter olmalıdır.")
        return v

    @field_validator("jira_ticket")
    @classmethod
    def validate_jira_ticket(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if v and not _JIRA_RE.match(v):
                raise ValueError("Jira ticket formatı geçersiz (örn: PROJ-123).")
        return v or None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=500)
    description: Optional[str] = Field(None, max_length=50000)
    assignee_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    jira_ticket: Optional[str] = Field(None, max_length=50)
    is_archived: Optional[bool] = None
    label_ids: Optional[list[uuid.UUID]] = None  # None = don't change; [] = clear all

    @field_validator("jira_ticket")
    @classmethod
    def validate_jira_ticket(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if v and not _JIRA_RE.match(v):
                raise ValueError("Jira ticket formatı geçersiz (örn: PROJ-123).")
        return v or None


class TaskMoveRequest(BaseModel):
    column_id: uuid.UUID
    sort_order: int


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    column_id: uuid.UUID
    column: ColumnResponse
    created_by: uuid.UUID
    creator: UserBasic
    assignee_id: Optional[uuid.UUID]
    assignee: Optional[UserBasic]
    priority: str
    due_date: Optional[date]
    start_date: Optional[date] = None
    jira_ticket: Optional[str]
    jira_status: Optional[str]
    jira_status_updated_at: Optional[datetime]
    sort_order: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    labels: list[LabelResponse] = Field(default_factory=list)
    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    items: list[TaskResponse]
    total: int
    skip: int
    limit: int


class TaskCommentCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1:
            raise ValueError("Yorum boş olamaz.")
        if len(v) > 2000:
            raise ValueError("Yorum en fazla 2000 karakter olabilir.")
        return v


class TaskCommentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: Optional[uuid.UUID]
    author: Optional[UserBasic]
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


class TaskHistoryChange(BaseModel):
    field: str
    old: Optional[str]
    new: Optional[str]


class TaskHistoryEntry(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    action: str
    changes: Optional[list[TaskHistoryChange]]
    actor: Optional[UserBasic]
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Subtask schemas ──────────────────────────────────────────────────────────

class SubtaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    sort_order: int = 0


class SubtaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    is_completed: Optional[bool] = None
    sort_order: Optional[int] = None


class SubtaskResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    title: str
    is_completed: bool
    sort_order: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AttachmentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    original_filename: str
    file_size: int
    mime_type: str
    uploaded_by: Optional[uuid.UUID]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
