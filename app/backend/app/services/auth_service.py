import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.user import User, RefreshToken, PasswordResetToken
from app.core.security import (
    hash_password, verify_password, needs_rehash,
    create_access_token, generate_refresh_token, hash_token,
    refresh_token_expire, generate_secure_token,
    password_reset_expire, activation_token_expire,
)
from app.core.exceptions import (
    AuthenticationError, ForbiddenError, ConflictError, NotFoundError, ValidationError
)
from app.config import settings


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, email: str, password: str, full_name: str, preferred_language: str = "tr") -> tuple[User, str]:
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        if result.scalar_one_or_none():
            raise ConflictError("Bu email adresi zaten kayıtlı.")

        user = User(
            email=email.lower(),
            hashed_password=hash_password(password),
            full_name=full_name,
            preferred_language=preferred_language,
            is_active=False,
        )
        self.db.add(user)
        await self.db.flush()  # get user.id without committing

        raw_token, token_hash = generate_secure_token()
        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=activation_token_expire(),
        )
        self.db.add(reset_record)
        await self.db.flush()

        return user, raw_token

    async def activate_account(self, raw_token: str) -> User:
        token_hash = hash_token(raw_token)
        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used == False,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise ValidationError("Geçersiz aktivasyon bağlantısı.")
        if record.expires_at < datetime.now(timezone.utc):
            raise ValidationError("Aktivasyon bağlantısının süresi dolmuş.")

        result2 = await self.db.execute(select(User).where(User.id == record.user_id))
        user = result2.scalar_one_or_none()
        if not user:
            raise NotFoundError("Kullanıcı")

        user.is_active = True
        record.used = True
        await self.db.flush()
        return user

    async def login(
        self,
        username: str,
        password: str,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> tuple[User, str, str]:
        """Returns (user, access_token, raw_refresh_token)."""
        result = await self.db.execute(
            select(User).where(User.username == username.lower(), User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user or not verify_password(password, user.hashed_password):
            raise AuthenticationError("Kullanıcı adı veya şifre hatalı.")
        if not user.is_active:
            raise ForbiddenError("Hesabınız aktif değil. Lütfen yöneticinizle iletişime geçin.")

        # Rehash if algorithm params changed
        if needs_rehash(user.hashed_password):
            user.hashed_password = hash_password(password)

        user.last_login_at = datetime.now(timezone.utc)

        raw_refresh, refresh_hash = generate_refresh_token()
        refresh_record = RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=refresh_token_expire(),
        )
        self.db.add(refresh_record)

        from app.models.audit_log import AuditLog
        self.db.add(AuditLog(
            user_id=user.id,
            action="login",
            table_name="auth",
            record_id=str(user.id),
            ip_address=ip,
            user_agent=user_agent,
        ))

        await self.db.flush()

        access_token = create_access_token(user.id, user.role)
        return user, access_token, raw_refresh

    async def refresh_access_token(self, raw_refresh_token: str) -> tuple[str, str]:
        """Returns (new_access_token, new_raw_refresh_token). Old token is revoked."""
        token_hash = hash_token(raw_refresh_token)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise AuthenticationError("Geçersiz refresh token.")
        if record.expires_at < datetime.now(timezone.utc):
            raise AuthenticationError("Refresh token süresi dolmuş.")

        result2 = await self.db.execute(
            select(User).where(User.id == record.user_id, User.is_deleted == False, User.is_active == True)
        )
        user = result2.scalar_one_or_none()
        if not user:
            raise AuthenticationError("Kullanıcı bulunamadı.")

        # Rotate: revoke old, issue new
        record.revoked = True
        raw_new, hash_new = generate_refresh_token()
        new_record = RefreshToken(
            user_id=user.id,
            token_hash=hash_new,
            expires_at=refresh_token_expire(),
        )
        self.db.add(new_record)
        await self.db.flush()

        return create_access_token(user.id, user.role), raw_new

    async def logout(
        self,
        raw_refresh_token: str,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        token_hash = hash_token(raw_refresh_token)
        record_result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        record = record_result.scalar_one_or_none()
        user_id = record.user_id if record else None

        await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .values(revoked=True)
        )

        from app.models.audit_log import AuditLog
        self.db.add(AuditLog(
            user_id=user_id,
            action="logout",
            table_name="auth",
            record_id=str(user_id) if user_id else "",
            ip_address=ip,
            user_agent=user_agent,
        ))

    async def forgot_password(self, email: str) -> Optional[tuple[User, str]]:
        """Returns (user, raw_token) or None if user not found (silently succeed for security)."""
        result = await self.db.execute(
            select(User).where(User.email == email.lower(), User.is_deleted == False, User.is_active == True)
        )
        user = result.scalar_one_or_none()
        if not user:
            return None

        raw_token, token_hash = generate_secure_token()
        record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=password_reset_expire(),
        )
        self.db.add(record)
        await self.db.flush()
        return user, raw_token

    async def reset_password(self, raw_token: str, new_password: str) -> User:
        token_hash = hash_token(raw_token)
        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used == False,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise ValidationError("Geçersiz veya kullanılmış şifre sıfırlama bağlantısı.")
        if record.expires_at < datetime.now(timezone.utc):
            raise ValidationError("Şifre sıfırlama bağlantısının süresi dolmuş.")

        result2 = await self.db.execute(select(User).where(User.id == record.user_id))
        user = result2.scalar_one_or_none()
        if not user:
            raise NotFoundError("Kullanıcı")

        user.hashed_password = hash_password(new_password)
        record.used = True

        # Revoke all refresh tokens for security
        await self.db.execute(
            update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True)
        )
        await self.db.flush()
        return user
