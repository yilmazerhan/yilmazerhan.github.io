import uuid
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.worklog import (
    WorkTypeCreate, WorkTypeUpdate, WorkTypeResponse,
    WorkLogCreate, WorkLogUpdate, WorkLogResponse,
    WorkLogListResponse, WorkLogSummary,
)
from app.schemas.auth import MessageResponse
from app.services.worklog_service import WorkLogService
from app.core.dependencies import get_current_user, require_superadmin

router = APIRouter(prefix="/worklogs", tags=["worklogs"])


# ─── Work Types ─────────────────────────────────────────────────────────────

@router.get("/work-types", response_model=list[WorkTypeResponse])
async def list_work_types(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    active_only: bool = Query(True),
):
    svc = WorkLogService(db)
    return await svc.list_work_types(active_only=active_only)


@router.post("/work-types", response_model=WorkTypeResponse, status_code=201)
async def create_work_type(
    body: WorkTypeCreate,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = WorkLogService(db)
    return await svc.create_work_type(body.name, body.color, body.sort_order, current_user.id)


@router.patch("/work-types/{wt_id}", response_model=WorkTypeResponse)
async def update_work_type(
    wt_id: uuid.UUID,
    body: WorkTypeUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = WorkLogService(db)
    return await svc.update_work_type(wt_id, body.name, body.color, body.sort_order, body.is_active)


@router.delete("/work-types/{wt_id}", response_model=MessageResponse)
async def delete_work_type(
    wt_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = WorkLogService(db)
    await svc.delete_work_type(wt_id)
    return {"message": "İş tipi silindi."}


# ─── Work Logs ──────────────────────────────────────────────────────────────

@router.get("", response_model=WorkLogListResponse)
async def list_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Optional[uuid.UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    svc = WorkLogService(db)
    items, total = await svc.list_logs(
        requester=current_user,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("", response_model=WorkLogResponse, status_code=201)
async def create_log(
    body: WorkLogCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = WorkLogService(db)
    return await svc.create_log(
        user_id=current_user.id,
        work_type_id=body.work_type_id,
        log_date=body.log_date,
        duration_hours=body.duration_hours,
        description=body.description,
    )


@router.get("/stats/summary", response_model=WorkLogSummary)
async def summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Optional[uuid.UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    svc = WorkLogService(db)
    return await svc.summary_stats(current_user, user_id, date_from, date_to)


@router.get("/{log_id}", response_model=WorkLogResponse)
async def get_log(
    log_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = WorkLogService(db)
    return await svc.get_log(log_id, current_user)


@router.patch("/{log_id}", response_model=WorkLogResponse)
async def update_log(
    log_id: uuid.UUID,
    body: WorkLogUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = WorkLogService(db)
    return await svc.update_log(
        log_id=log_id,
        requester=current_user,
        work_type_id=body.work_type_id,
        log_date=body.log_date,
        duration_hours=body.duration_hours,
        description=body.description,
    )


@router.delete("/{log_id}", response_model=MessageResponse)
async def delete_log(
    log_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = WorkLogService(db)
    await svc.delete_log(log_id, current_user)
    return {"message": "İş günlüğü kaydı silindi."}
