import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class ColumnCreate(BaseModel):
    name: str
    color: str = "#e2e8f0"
    is_terminal: bool = False
    sort_order: int = 0

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
    name: str
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
    title: str
    column_id: uuid.UUID
    description: Optional[str] = None
    assignee_id: Optional[uuid.UUID] = None
    priority: str = "medium"
    due_date: Optional[date] = None
    jira_ticket: Optional[str] = None

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


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    jira_ticket: Optional[str] = None
    is_archived: Optional[bool] = None


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
    jira_ticket: Optional[str]
    jira_status: Optional[str]
    jira_status_updated_at: Optional[datetime]
    sort_order: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime
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
