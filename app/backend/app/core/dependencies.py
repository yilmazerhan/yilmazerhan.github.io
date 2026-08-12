import uuid
from typing import Annotated, Optional

from fastapi import Depends, Cookie, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt.exceptions import InvalidTokenError as JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.permission import PermissionOverride
from app.core.security import decode_access_token
from app.core.exceptions import AuthenticationError, ForbiddenError, NotFoundError
from app.core.permissions import has_permission

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not credentials:
        raise AuthenticationError("Authorization header eksik.")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise AuthenticationError("Geçersiz veya süresi dolmuş token.")

    result = await db.execute(
        select(User)
        .options(selectinload(User.team))
        .where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise AuthenticationError("Kullanıcı bulunamadı.")
    if not user.is_active:
        raise ForbiddenError("Hesabınız henüz aktive edilmemiş.")
    return user


async def get_current_user_with_overrides(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> tuple[User, list[PermissionOverride]]:
    result = await db.execute(
        select(PermissionOverride).where(PermissionOverride.user_id == current_user.id)
    )
    overrides = list(result.scalars().all())
    return current_user, overrides


def require_permission(module: str, action: str):
    async def checker(
        user_and_overrides: Annotated[
            tuple[User, list], Depends(get_current_user_with_overrides)
        ],
    ) -> User:
        user, overrides = user_and_overrides
        if not has_permission(user, overrides, module, action):
            raise ForbiddenError(f"'{module}' modülünde '{action}' yetkisi yok.")
        return user
    return checker


def require_superadmin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != "superadmin":
        raise ForbiddenError("Yalnızca superadmin erişebilir.")
    return current_user


def require_manager_or_above(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role not in ("superadmin", "team_manager"):
        raise ForbiddenError("Yalnızca ekip yöneticisi veya superadmin erişebilir.")
    return current_user
