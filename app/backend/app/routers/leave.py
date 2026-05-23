import uuid
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.leave import LeaveRequestCreate, LeaveRequestUpdate, LeaveRequestResponse
from app.services.leave_service import LeaveService
from app.core.dependencies import get_current_user, require_superadmin

router = APIRouter(prefix="/leaves", tags=["leaves"])


@router.get("", response_model=list[LeaveRequestResponse])
async def list_leaves(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[Optional[uuid.UUID], Query()] = None,
    status: Annotated[Optional[str], Query()] = None,
    date_from: Annotated[Optional[date], Query()] = None,
    date_to: Annotated[Optional[date], Query()] = None,
):
    svc = LeaveService(db)
    return await svc.list_leaves(
        requester=current_user,
        user_id=user_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("", response_model=LeaveRequestResponse, status_code=201)
async def create_leave(
    body: LeaveRequestCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = LeaveService(db)
    return await svc.create_leave(
        user_id=current_user.id,
        start_date=body.start_date,
        end_date=body.end_date,
        reason=body.reason,
    )


@router.get("/{leave_id}", response_model=LeaveRequestResponse)
async def get_leave(
    leave_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = LeaveService(db)
    return await svc.get_leave(leave_id=leave_id, requester=current_user)


@router.patch("/{leave_id}", response_model=LeaveRequestResponse)
async def update_leave(
    leave_id: uuid.UUID,
    body: LeaveRequestUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = LeaveService(db)
    return await svc.update_leave(
        leave_id=leave_id,
        requester=current_user,
        status=body.status,
        review_note=body.review_note,
    )


@router.delete("/{leave_id}", status_code=204)
async def delete_leave(
    leave_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = LeaveService(db)
    await svc.delete_leave(leave_id=leave_id, requester=current_user)
