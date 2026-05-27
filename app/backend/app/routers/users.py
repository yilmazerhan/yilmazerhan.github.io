import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserCreate, UserUpdate, UserResponse, UserListResponse,
    ProfileUpdate, ChangePasswordRequest, AdminSetPasswordRequest
)
from app.schemas.auth import MessageResponse
from app.services.user_service import UserService
from app.core.dependencies import (
    get_current_user, require_superadmin, require_manager_or_above
)
from app.core.task_utils import fire_and_forget

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=UserListResponse)
async def list_users(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    team_id: Optional[uuid.UUID] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None, max_length=200),
    include_deleted: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    # Only superadmin can view deleted users
    if include_deleted and current_user.role != "superadmin":
        include_deleted = False
    svc = UserService(db)
    items, total = await svc.list_users(
        requester=current_user,
        team_id=team_id,
        role=role,
        is_active=is_active,
        search=search,
        include_deleted=include_deleted,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UserService(db)
    user, temp_password = await svc.create_user(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        team_id=body.team_id,
        preferred_language=body.preferred_language,
        username=body.username,
    )
    from app.tasks.email_tasks import send_new_account_email_task
    fire_and_forget(send_new_account_email_task,
                    to_email=user.email,
                    full_name=user.full_name,
                    username=user.username,
                    temp_password=temp_password)
    return user


@router.get("/me/profile", response_model=UserResponse)
async def get_my_profile(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.patch("/me/profile", response_model=UserResponse)
async def update_my_profile(
    body: ProfileUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UserService(db)
    updated = await svc.update_user(
        user_id=current_user.id,
        requester=current_user,
        full_name=body.full_name,
        preferred_language=body.preferred_language,
        preferred_theme=body.preferred_theme,
    )
    return updated


@router.post("/me/change-password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UserService(db)
    await svc.change_own_password(current_user, body.old_password, body.new_password)
    return {"message": "Şifreniz başarıyla değiştirildi."}


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UserService(db)
    target = await svc.get_by_id(user_id)
    # Team managers may only view users who belong to one of their teams
    if current_user.role == "team_manager":
        from sqlalchemy import select as sa_select
        from app.models.user_team import user_teams as ut
        # Check if target user shares a team with the requester
        shared = await db.execute(
            sa_select(ut.c.team_id).where(
                ut.c.user_id == current_user.id,
                ut.c.team_id.in_(
                    sa_select(ut.c.team_id).where(ut.c.user_id == user_id)
                ),
            ).limit(1)
        )
        if not shared.scalar_one_or_none():
            from app.core.exceptions import ForbiddenError
            raise ForbiddenError("Yalnızca kendi takımınızdaki kullanıcıları görüntüleyebilirsiniz.")
    return target


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UserService(db)
    return await svc.update_user(
        user_id=user_id,
        requester=current_user,
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        team_id=body.team_id,
        is_active=body.is_active,
        preferred_language=body.preferred_language,
        preferred_theme=body.preferred_theme,
    )


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UserService(db)
    await svc.soft_delete_user(user_id, current_user)
    return {"message": "Kullanıcı başarıyla silindi."}


@router.post("/{user_id}/set-password", response_model=MessageResponse)
async def admin_set_password(
    user_id: uuid.UUID,
    body: AdminSetPasswordRequest,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UserService(db)
    await svc.admin_set_password(user_id, body.new_password, current_user)
    return {"message": "Kullanıcının şifresi başarıyla güncellendi."}


@router.post("/{user_id}/restore", response_model=UserResponse)
async def restore_user(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Restore a soft-deleted user to active status."""
    svc = UserService(db)
    return await svc.restore_user(user_id, current_user)


@router.delete("/{user_id}/hard", response_model=MessageResponse)
async def hard_delete_user(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Permanently delete a soft-deleted user. This cannot be undone."""
    svc = UserService(db)
    await svc.hard_delete_user(user_id, current_user)
    return {"message": "Kullanıcı kalıcı olarak silindi."}


@router.patch("/{user_id}/resend-activation", response_model=MessageResponse)
async def resend_activation(
    user_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = UserService(db)
    user, token = await svc.resend_activation(user_id)
    from app.tasks.email_tasks import send_activation_email_task
    fire_and_forget(send_activation_email_task,
                    to_email=user.email,
                    full_name=user.full_name,
                    activation_token=token)
    return {"message": "Aktivasyon emaili yeniden gönderildi."}
