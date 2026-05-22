import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.team import Team
from app.core.security import hash_password
from app.core.exceptions import ConflictError, NotFoundError, ForbiddenError, ValidationError


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: uuid.UUID) -> User:
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.team))
            .where(User.id == user_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Kullanıcı")
        return user

    async def list_users(
        self,
        requester: User,
        team_id: Optional[uuid.UUID] = None,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[User], int]:
        query = (
            select(User)
            .options(selectinload(User.team))
            .where(User.is_deleted == False)
        )

        # Managers can only see their own team
        if requester.role == "team_manager":
            query = query.where(User.team_id == requester.team_id)
        elif team_id:
            query = query.where(User.team_id == team_id)

        if role:
            query = query.where(User.role == role)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                (User.full_name.ilike(pattern)) | (User.email.ilike(pattern))
            )

        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one()

        query = query.offset(skip).limit(limit).order_by(User.full_name)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def create_user(
        self,
        email: str,
        full_name: str,
        role: str = "user",
        team_id: Optional[uuid.UUID] = None,
        preferred_language: str = "tr",
        send_activation: bool = True,
    ) -> tuple[User, str]:
        result = await self.db.execute(
            select(User).where(User.email == email.lower())
        )
        if result.scalar_one_or_none():
            raise ConflictError("Bu email adresi zaten kayıtlı.")

        if team_id:
            team_exists = await self.db.execute(select(Team).where(Team.id == team_id))
            if not team_exists.scalar_one_or_none():
                raise NotFoundError("Takım")

        import secrets
        temp_password = secrets.token_urlsafe(16)
        user = User(
            email=email.lower(),
            hashed_password=hash_password(temp_password),
            full_name=full_name,
            role=role,
            team_id=team_id,
            preferred_language=preferred_language,
            is_active=not send_activation,
        )
        self.db.add(user)
        await self.db.flush()

        activation_token = ""
        if send_activation:
            from app.core.security import generate_secure_token, activation_token_expire
            from app.models.user import PasswordResetToken
            raw_token, token_hash = generate_secure_token()
            record = PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=activation_token_expire(),
            )
            self.db.add(record)
            activation_token = raw_token

        await self.db.flush()
        return user, activation_token

    async def update_user(
        self,
        user_id: uuid.UUID,
        requester: User,
        full_name: Optional[str] = None,
        role: Optional[str] = None,
        team_id: Optional[uuid.UUID] = None,
        is_active: Optional[bool] = None,
        preferred_language: Optional[str] = None,
        preferred_theme: Optional[str] = None,
    ) -> User:
        user = await self.get_by_id(user_id)

        # Managers can only update users in their team
        if requester.role == "team_manager":
            if user.team_id != requester.team_id:
                raise ForbiddenError("Yalnızca kendi takımınızdaki kullanıcıları düzenleyebilirsiniz.")
            if role and role in ("superadmin", "team_manager"):
                raise ForbiddenError("Takım yöneticisi kullanıcı rolünü yükseltemez.")

        if full_name is not None:
            user.full_name = full_name
        if role is not None:
            user.role = role
        if team_id is not None:
            team_exists = await self.db.execute(select(Team).where(Team.id == team_id))
            if not team_exists.scalar_one_or_none():
                raise NotFoundError("Takım")
            user.team_id = team_id
        if is_active is not None:
            user.is_active = is_active
        if preferred_language is not None:
            if preferred_language not in ("tr", "en"):
                raise ValidationError("Geçersiz dil seçimi.")
            user.preferred_language = preferred_language
        if preferred_theme is not None:
            if preferred_theme not in ("light", "dark"):
                raise ValidationError("Geçersiz tema seçimi.")
            user.preferred_theme = preferred_theme

        await self.db.flush()
        return user

    async def soft_delete_user(self, user_id: uuid.UUID, requester: User) -> None:
        user = await self.get_by_id(user_id)
        if user.id == requester.id:
            raise ForbiddenError("Kendi hesabınızı silemezsiniz.")
        if user.role == "superadmin" and requester.role == "superadmin":
            # Count remaining superadmins
            count_result = await self.db.execute(
                select(func.count()).where(User.role == "superadmin", User.is_deleted == False)
            )
            if count_result.scalar_one() <= 1:
                raise ForbiddenError("Son superadmin hesabı silinemez.")
        user.is_deleted = True
        user.is_active = False
        await self.db.flush()

    async def change_own_password(self, user: User, old_password: str, new_password: str) -> None:
        from app.core.security import verify_password
        if not verify_password(old_password, user.hashed_password):
            raise ForbiddenError("Mevcut şifre hatalı.")
        user.hashed_password = hash_password(new_password)
        from sqlalchemy import update as sa_update
        from app.models.user import RefreshToken
        await self.db.execute(
            sa_update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True)
        )
        await self.db.flush()

    async def admin_set_password(self, target_user_id: uuid.UUID, new_password: str, requester: User) -> None:
        target = await self.get_by_id(target_user_id)
        if requester.role == "superadmin":
            pass  # full access
        elif requester.role == "team_manager":
            if (
                target.team_id is None
                or target.team_id != requester.team_id
                or target.role in ("superadmin", "team_manager")
            ):
                raise ForbiddenError("Bu kullanıcının şifresini değiştirme yetkiniz yok.")
        else:
            raise ForbiddenError("Bu işlem için yetkiniz yok.")
        target.hashed_password = hash_password(new_password)
        from sqlalchemy import update as sa_update
        from app.models.user import RefreshToken
        await self.db.execute(
            sa_update(RefreshToken).where(RefreshToken.user_id == target.id).values(revoked=True)
        )
        await self.db.flush()

    async def resend_activation(self, user_id: uuid.UUID) -> tuple[User, str]:
        user = await self.get_by_id(user_id)
        if user.is_active:
            raise ValidationError("Kullanıcı zaten aktif.")

        from app.core.security import generate_secure_token, activation_token_expire
        from app.models.user import PasswordResetToken
        raw_token, token_hash = generate_secure_token()
        record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=activation_token_expire(),
        )
        self.db.add(record)
        await self.db.flush()
        return user, raw_token
