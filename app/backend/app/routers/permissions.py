import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.permission import (
    PermissionOverrideResponse, SetPermissionsRequest, EffectivePermissions
)
from app.schemas.auth import MessageResponse
from app.services.permission_service import PermissionService
from app.core.dependencies import require_superadmin, get_current_user

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("/users/{user_id}", response_model=list[PermissionOverrideResponse])
async def get_user_overrides(
    user_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PermissionService(db)
    return await svc.get_overrides_for_user(user_id)


@router.put("/users/{user_id}", response_model=list[PermissionOverrideResponse])
async def set_user_overrides(
    user_id: uuid.UUID,
    body: SetPermissionsRequest,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PermissionService(db)
    overrides = await svc.set_overrides(
        user_id=user_id,
        overrides=[o.model_dump() for o in body.overrides],
        set_by=current_user.id,
    )
    return overrides


@router.delete("/users/{user_id}/{module}/{action}", response_model=MessageResponse)
async def delete_override(
    user_id: uuid.UUID,
    module: str,
    action: str,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PermissionService(db)
    await svc.delete_override(user_id, module, action)
    return {"message": "Yetki override'ı silindi."}


@router.get("/effective/me", response_model=EffectivePermissions)
async def get_my_effective_permissions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return the effective permissions for the currently authenticated user."""
    svc = PermissionService(db)
    perms = await svc.get_effective_permissions(current_user.id)
    return {"user_id": current_user.id, "role": current_user.role, "permissions": perms}


@router.get("/effective/{user_id}", response_model=EffectivePermissions)
async def get_effective_permissions(
    user_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from sqlalchemy import select
    from app.models.user import User as UserModel

    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Kullanıcı")

    svc = PermissionService(db)
    perms = await svc.get_effective_permissions(user_id)
    return {"user_id": user_id, "role": user.role, "permissions": perms}
