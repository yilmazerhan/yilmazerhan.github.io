import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.responsibility import (
    GroupCreate, GroupUpdate, GroupResponse,
    MemberCreate, MemberUpdate, MemberResponse,
)
from app.schemas.auth import MessageResponse
from app.services.responsibility_service import ResponsibilityService
from app.core.dependencies import get_current_user, require_superadmin

router = APIRouter(prefix="/responsibility-groups", tags=["responsibility"])


@router.get("", response_model=list[GroupResponse])
async def list_groups(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = ResponsibilityService(db)
    return await svc.list_groups()


@router.post("", response_model=GroupResponse, status_code=201)
async def create_group(
    body: GroupCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = ResponsibilityService(db)
    return await svc.create_group(
        name=body.name,
        description=body.description,
        color=body.color,
        display_order=body.display_order,
    )


@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: uuid.UUID,
    body: GroupUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = ResponsibilityService(db)
    return await svc.update_group(group_id, **body.model_dump(exclude_unset=True))


@router.delete("/{group_id}", response_model=MessageResponse)
async def delete_group(
    group_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = ResponsibilityService(db)
    await svc.delete_group(group_id)
    return {"message": "Sorumluluk grubu silindi."}


@router.post("/{group_id}/members", response_model=MemberResponse, status_code=201)
async def add_member(
    group_id: uuid.UUID,
    body: MemberCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = ResponsibilityService(db)
    return await svc.add_member(group_id, body.user_id, body.modules)


@router.patch("/{group_id}/members/{member_id}", response_model=MemberResponse)
async def update_member(
    group_id: uuid.UUID,
    member_id: uuid.UUID,
    body: MemberUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = ResponsibilityService(db)
    return await svc.update_member(member_id, body.modules)


@router.delete("/{group_id}/members/{member_id}", response_model=MessageResponse)
async def remove_member(
    group_id: uuid.UUID,
    member_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = ResponsibilityService(db)
    await svc.remove_member(member_id)
    return {"message": "Üye gruptan kaldırıldı."}
