import uuid
import re
import secrets
import string
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.team import Team
from app.models.user_team import user_teams
from app.core.security import hash_password
from app.core.exceptions import ConflictError, NotFoundError, ForbiddenError, ValidationError


def _generate_strong_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        pwd = ''.join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isupper() for c in pwd) and any(c.islower() for c in pwd) and any(c.isdigit() for c in pwd):
            return pwd


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
        include_deleted: bool = False,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[User], int]:
        query = (
            select(User)
            .options(selectinload(User.team))
        )
        if not include_deleted:
            query = query.where(User.is_deleted == False)

        # Role-based scoping: users only see colleagues in their teams
        if requester.role == "team_manager":
            # Use IN subquery (not JOIN) to avoid duplicate rows when a user belongs
            # to multiple teams all managed by the same manager, and to keep the
            # count subquery accurate. Always include the manager themselves in case
            # their junction row is missing (repaired by migration 0023).
            my_team_ids = (
                select(user_teams.c.team_id)
                .where(user_teams.c.user_id == requester.id)
                .scalar_subquery()
            )
            visible_user_ids = (
                select(user_teams.c.user_id)
                .where(user_teams.c.team_id.in_(my_team_ids))
                .scalar_subquery()
            )
            query = query.where(
                (User.id == requester.id) | (User.id.in_(visible_user_ids))
            )
        elif requester.role == "user":
            # Regular users see only their own team members (to enable task assignment)
            # If they have no team they see only themselves.
            # Use IN subquery to avoid duplicate rows from multiple shared teams.
            my_team_ids = (
                select(user_teams.c.team_id)
                .where(user_teams.c.user_id == requester.id)
                .scalar_subquery()
            )
            visible_user_ids = (
                select(user_teams.c.user_id)
                .where(user_teams.c.team_id.in_(my_team_ids))
                .scalar_subquery()
            )
            query = query.where(
                (User.id.in_(visible_user_ids)) | (User.id == requester.id)
            )
        elif team_id:
            # Superadmin filtering by team_id: use junction table
            query = query.join(user_teams, User.id == user_teams.c.user_id).where(
                user_teams.c.team_id == team_id
            )

        if role:
            query = query.where(User.role == role)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        if search:
            # Escape LIKE wildcard characters so that user-supplied % and _ are treated
            # as literals, not wildcards (prevents catastrophic backtracking / ReDoS on DB)
            safe_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{safe_search}%"
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

    @staticmethod
    def _normalize_username_base(raw: str) -> str:
        """Convert raw string to a clean username base using dot separator."""
        s = raw.lower()
        # Transliterate Turkish characters
        for src, dst in [('ı','i'),('i̇','i'),('ğ','g'),('ğ','g'),
                         ('ü','u'),('ş','s'),('ö','o'),('ç','c')]:
            s = s.replace(src, dst)
        # Replace spaces, hyphens, underscores with dot
        s = s.replace(' ', '.').replace('-', '.').replace('_', '.')
        # Keep only [a-z0-9.]
        s = re.sub(r'[^a-z0-9.]', '', s)
        # Collapse consecutive dots, strip leading/trailing dots
        s = re.sub(r'\.{2,}', '.', s).strip('.')
        return (s[:30] or 'user')

    async def _generate_unique_username(self, email: str, hint: Optional[str] = None) -> str:
        base = self._normalize_username_base(hint if hint else email.split('@')[0])
        username = base
        counter = 1
        while True:
            exists = await self.db.execute(select(User).where(User.username == username))
            if not exists.scalar_one_or_none():
                return username
            username = f"{base}.{counter}"
            counter += 1

    async def create_user(
        self,
        email: str,
        full_name: str,
        role: str = "user",
        team_id: Optional[uuid.UUID] = None,
        preferred_language: str = "tr",
        username: Optional[str] = None,
    ) -> tuple[User, str]:
        result = await self.db.execute(
            select(User).where(User.email == email.lower())
        )
        existing = result.scalar_one_or_none()
        if existing:
            if existing.is_deleted:
                raise ConflictError(
                    "Bu email adresi daha önce silinmiş bir kullanıcıya ait. "
                    "Kullanıcıyı 'Silinen Kullanıcılar' listesinden geri yükleyebilirsiniz."
                )
            raise ConflictError("Bu email adresi zaten kayıtlı.")

        if team_id:
            team_exists = await self.db.execute(select(Team).where(Team.id == team_id))
            if not team_exists.scalar_one_or_none():
                raise NotFoundError("Takım")

        # Generate unique username

        final_username = await self._generate_unique_username(email, hint=username)

        # Check if requested username is already taken (normalize hint same way as _generate_unique_username)
        if username:
            normalized_hint = self._normalize_username_base(username)
            if final_username != normalized_hint:
                raise ConflictError("Bu kullanıcı adı zaten kullanımda.")

        temp_password = _generate_strong_password()
        user = User(
            email=email.lower(),
            username=final_username,
            hashed_password=hash_password(temp_password),
            full_name=full_name,
            role=role,
            team_id=team_id,
            preferred_language=preferred_language,
            is_active=True,
        )
        self.db.add(user)
        await self.db.flush()

        # Sync junction table so team-scoped queries (worklog, user list) find this user
        if team_id:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            await self.db.execute(
                pg_insert(user_teams)
                .values(user_id=user.id, team_id=team_id)
                .on_conflict_do_nothing()
            )

        # Auto-create personal kanban board for the new user
        from app.services.kanban_service import KanbanService
        kanban_svc = KanbanService(self.db)
        await kanban_svc.create_board(
            name="Kişisel Pano",
            description="Yalnızca size özel kanban panonuz.",
            color="#8b5cf6",
            created_by=user.id,
            is_personal=True,
        )

        # Eager-load the team relationship so response serialization doesn't trigger
        # a lazy load outside the async context (MissingGreenlet) when team_id is set.
        await self.db.refresh(user, attribute_names=["team"])

        return user, temp_password

    async def update_user(
        self,
        user_id: uuid.UUID,
        requester: User,
        email: Optional[str] = None,
        full_name: Optional[str] = None,
        role: Optional[str] = None,
        team_id: Optional[uuid.UUID] = None,
        is_active: Optional[bool] = None,
        preferred_language: Optional[str] = None,
        preferred_theme: Optional[str] = None,
    ) -> User:
        user = await self.get_by_id(user_id)

        # Managers can only update users who share one of their managed teams (junction table)
        if requester.role == "team_manager":
            # Use junction table — not the denormalized team_id FK which may lag behind
            my_team_ids_q = select(user_teams.c.team_id).where(user_teams.c.user_id == requester.id)
            target_team_ids_q = select(user_teams.c.team_id).where(user_teams.c.user_id == user_id)
            shared_q = await self.db.execute(
                select(user_teams.c.team_id).where(
                    user_teams.c.team_id.in_(my_team_ids_q),
                    user_teams.c.team_id.in_(target_team_ids_q),
                ).limit(1)
            )
            if not shared_q.scalar_one_or_none():
                raise ForbiddenError("Yalnızca kendi takımınızdaki kullanıcıları düzenleyebilirsiniz.")
            if role and role in ("superadmin", "team_manager"):
                raise ForbiddenError("Takım yöneticisi kullanıcı rolünü yükseltemez.")
            if email is not None:
                raise ForbiddenError("Takım yöneticisi kullanıcı email adresini değiştiremez.")

        if email is not None:
            new_email = email.lower().strip()
            if new_email != user.email:
                # Check uniqueness — including soft-deleted users
                conflict = await self.db.execute(
                    select(User).where(User.email == new_email, User.id != user_id)
                )
                conflict_user = conflict.scalar_one_or_none()
                if conflict_user:
                    if conflict_user.is_deleted:
                        raise ConflictError(
                            "Bu email adresi daha önce silinmiş bir kullanıcıya ait. "
                            "Kullanıcıyı 'Silinen Kullanıcılar' listesinden geri yükleyebilirsiniz."
                        )
                    raise ConflictError("Bu email adresi başka bir kullanıcı tarafından kullanılıyor.")
                user.email = new_email

        if full_name is not None:
            user.full_name = full_name
        if role is not None:
            user.role = role
        if team_id is not None:
            team_exists = await self.db.execute(select(Team).where(Team.id == team_id))
            if not team_exists.scalar_one_or_none():
                raise NotFoundError("Takım")
            user.team_id = team_id
            # Sync junction table so team-scoped queries find this user in the new team
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            await self.db.execute(
                pg_insert(user_teams)
                .values(user_id=user_id, team_id=team_id)
                .on_conflict_do_nothing()
            )
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
        # Refresh team so the response reflects a changed team_id (and never lazy-loads
        # outside the async context during serialization).
        await self.db.refresh(user, attribute_names=["team"])
        return user

    async def _get_fallback_superadmin(self, exclude_user_id: uuid.UUID) -> Optional[User]:
        """Return the superuser account (or any active superadmin) to inherit manager duties."""
        # Prefer the seeded 'superuser' account
        result = await self.db.execute(
            select(User).where(
                User.username == "superuser",
                User.is_deleted == False,
                User.is_active == True,
                User.id != exclude_user_id,
            ).limit(1)
        )
        fallback = result.scalar_one_or_none()
        if fallback:
            return fallback
        # Any other active superadmin
        result = await self.db.execute(
            select(User).where(
                User.role == "superadmin",
                User.is_deleted == False,
                User.is_active == True,
                User.id != exclude_user_id,
            ).limit(1)
        )
        return result.scalar_one_or_none()

    async def _reassign_managed_teams(self, user: User, fallback: Optional[User]) -> None:
        """Reassign all teams managed by user to fallback superadmin (or NULL if none)."""
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        teams_result = await self.db.execute(
            select(Team).where(Team.manager_id == user.id)
        )
        managed_teams = teams_result.scalars().all()
        for team in managed_teams:
            if fallback:
                team.manager_id = fallback.id
                # Ensure fallback is in the junction table for this team
                await self.db.execute(
                    pg_insert(user_teams)
                    .values(user_id=fallback.id, team_id=team.id)
                    .on_conflict_do_nothing()
                )
            else:
                team.manager_id = None

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

        # Reassign managed teams before marking deleted
        if user.role in ("superadmin", "team_manager"):
            fallback = await self._get_fallback_superadmin(user.id)
            await self._reassign_managed_teams(user, fallback)

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
            # Reject attempts to change another manager's or admin's password
            if target.role in ("superadmin", "team_manager"):
                raise ForbiddenError("Bu kullanıcının şifresini değiştirme yetkiniz yok.")
            # Use the junction table (authoritative) instead of the stale team_id FK
            shared = await self.db.execute(
                select(user_teams.c.team_id).where(
                    user_teams.c.user_id == requester.id,
                    user_teams.c.team_id.in_(
                        select(user_teams.c.team_id).where(user_teams.c.user_id == target_user_id)
                    ),
                ).limit(1)
            )
            if not shared.scalar_one_or_none():
                raise ForbiddenError("Bu kullanıcının şifresini değiştirme yetkiniz yok.")
        else:
            raise ForbiddenError("Bu işlem için yetkiniz yok.")
        import re as _re
        if len(new_password) < 8:
            raise ValidationError("Şifre en az 8 karakter olmalıdır.")
        if not _re.search(r"[A-Z]", new_password):
            raise ValidationError("Şifre en az bir büyük harf içermelidir.")
        if not _re.search(r"[a-z]", new_password):
            raise ValidationError("Şifre en az bir küçük harf içermelidir.")
        if not _re.search(r"\d", new_password):
            raise ValidationError("Şifre en az bir rakam içermelidir.")
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

    async def get_deleted_by_id(self, user_id: uuid.UUID) -> User:
        """Fetch a soft-deleted user (for restore/hard-delete operations)."""
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.team))
            .where(User.id == user_id, User.is_deleted == True)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Silinmiş kullanıcı")
        return user

    async def restore_user(self, user_id: uuid.UUID, requester: User) -> User:
        """Restore a soft-deleted user back to active state."""
        if requester.role != "superadmin":
            raise ForbiddenError("Kullanıcı geri yükleme yalnızca superadmin tarafından yapılabilir.")
        user = await self.get_deleted_by_id(user_id)
        user.is_deleted = False
        user.is_active = True
        await self.db.flush()
        # Re-query with relationships loaded
        result = await self.db.execute(
            select(User).options(selectinload(User.team)).where(User.id == user_id)
        )
        return result.scalar_one()

    async def hard_delete_user(self, user_id: uuid.UUID, requester: User) -> None:
        """Permanently (hard) delete a user record. Only for already soft-deleted users."""
        if requester.role != "superadmin":
            raise ForbiddenError("Kalıcı silme yalnızca superadmin tarafından yapılabilir.")
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == True)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Silinmiş kullanıcı")

        # Clear any remaining team manager FK references to avoid constraint violation.
        # (soft_delete should have already reassigned these, but guard here too.)
        await self.db.execute(
            update(Team).where(Team.manager_id == user_id).values(manager_id=None)
        )

        # Revoke all tokens first
        from sqlalchemy import update as sa_update
        from app.models.user import RefreshToken
        await self.db.execute(
            sa_update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True)
        )
        # Remove from junction table
        from sqlalchemy import delete as sa_delete
        await self.db.execute(
            sa_delete(user_teams).where(user_teams.c.user_id == user_id)
        )
        await self.db.delete(user)
        await self.db.flush()
