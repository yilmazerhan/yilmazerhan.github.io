import uuid
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.kanban import (
    ColumnCreate, ColumnUpdate, ColumnReorderItem, ColumnResponse,
    TaskCreate, TaskUpdate, TaskMoveRequest, TaskResponse, TaskListResponse,
)
from app.schemas.auth import MessageResponse
from app.services.kanban_service import KanbanService
from app.core.dependencies import get_current_user, require_superadmin, require_manager_or_above

router = APIRouter(prefix="/kanban", tags=["kanban"])


# ─── Columns ──────────────────────────────────────────────────────────────────

@router.get("/columns", response_model=list[ColumnResponse])
async def list_columns(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.list_columns()


@router.post("/columns", response_model=ColumnResponse, status_code=201)
async def create_column(
    body: ColumnCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.create_column(body.name, body.color, body.is_terminal, body.sort_order)


@router.patch("/columns/{col_id}", response_model=ColumnResponse)
async def update_column(
    col_id: uuid.UUID,
    body: ColumnUpdate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.update_column(col_id, body.name, body.color, body.is_terminal, body.sort_order)


@router.delete("/columns/{col_id}", response_model=MessageResponse)
async def delete_column(
    col_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.delete_column(col_id, current_user)
    return {"message": "Sütun silindi."}


@router.put("/columns/reorder", response_model=list[ColumnResponse])
async def reorder_columns(
    body: list[ColumnReorderItem],
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.reorder_columns([{"id": str(item.id), "sort_order": item.sort_order} for item in body])


# ─── Tasks ────────────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    assignee_id: Optional[uuid.UUID] = Query(None),
    team_id: Optional[uuid.UUID] = Query(None),
    column_id: Optional[uuid.UUID] = Query(None),
    priority: Optional[str] = Query(None),
    due_before: Optional[date] = Query(None),
    include_archived: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
):
    svc = KanbanService(db)
    items, total = await svc.list_tasks(
        requester=current_user,
        assignee_id=assignee_id,
        team_id=team_id,
        column_id=column_id,
        priority=priority,
        due_before=due_before,
        include_archived=include_archived,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    body: TaskCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.create_task(
        title=body.title,
        column_id=body.column_id,
        created_by=current_user.id,
        description=body.description,
        assignee_id=body.assignee_id,
        priority=body.priority,
        due_date=body.due_date,
        jira_ticket=body.jira_ticket,
    )


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.get_task(task_id, current_user)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    sent = body.model_fields_set
    return await svc.update_task(
        task_id=task_id,
        requester=current_user,
        title=body.title,
        description=body.description,
        assignee_id=body.assignee_id if "assignee_id" in sent else ...,
        priority=body.priority,
        due_date=body.due_date if "due_date" in sent else ...,
        jira_ticket=body.jira_ticket,
        is_archived=body.is_archived,
    )


@router.patch("/tasks/{task_id}/move", response_model=TaskResponse)
async def move_task(
    task_id: uuid.UUID,
    body: TaskMoveRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.move_task(task_id, body.column_id, body.sort_order, current_user)


@router.delete("/tasks/{task_id}", response_model=MessageResponse)
async def delete_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.delete_task(task_id, current_user)
    return {"message": "Görev arşivlendi."}
