import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.user import User, RefreshToken, PasswordResetToken
from app.core.security import (
    hash_password, verify_password, needs_rehash,
    create_access_token, generate_refresh_token, hash_token,
    generate_secure_token, password_reset_expire, activation_token_expire,
    DUMMY_PASSWORD_HASH,
)
from app.core.exceptions import (
    AuthenticationError, ForbiddenError, ConflictError, NotFoundError, ValidationError
)
from app.config import settings

logger = logging.getLogger(__name__)


async def _write_auth_audit(
    user_id: uuid.UUID,
    action: str,
    ip: Optional[str],
    user_agent: Optional[str],
) -> None:
    """Write login/logout audit entry in a separate session (fire-and-forget)."""
    try:
        from app.database import AsyncSessionLocal
        from app.models.audit_log import AuditLog
        async with AsyncSessionLocal() as db:
            db.add(AuditLog(
                user_id=user_id,
                action=action,
                table_name="auth",
                record_id=str(user_id),
                ip_address=ip,
                user_agent=user_agent,
            ))
            await db.commit()
    except Exception as exc:
        logger.warning("Auth audit log write failed (non-critical): %s", exc)


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _generate_unique_username(self, email: str) -> str:
        import re
        base = re.sub(r"[^a-z0-9]", "_", email.split("@")[0].lower())[:80]
        candidate = base
        suffix = 0
        while True:
            existing = await self.db.execute(select(User).where(User.username == candidate))
            if existing.scalar_one_or_none() is None:
                return candidate
            suffix += 1
            candidate = f"{base}{suffix}"

    async def register(self, email: str, password: str, full_name: str, preferred_language: str = "tr") -> tuple[User, str]:
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        if result.scalar_one_or_none():
            raise ConflictError("Bu email adresi zaten kayıtlı.")

        username = await self._generate_unique_username(email.lower())
        user = User(
            email=email.lower(),
            username=username,
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
        # Always run verify_password (against a dummy hash if user not found) so
        # the response time does not reveal whether the username exists.
        password_ok = verify_password(password, user.hashed_password if user else DUMMY_PASSWORD_HASH)
        if not user or not password_ok:
            raise AuthenticationError("Kullanıcı adı veya şifre hatalı.")
        if not user.is_active:
            raise ForbiddenError("Hesabınız aktif değil. Lütfen yöneticinizle iletişime geçin.")

        # Rehash if algorithm params changed
        if needs_rehash(user.hashed_password):
            user.hashed_password = hash_password(password)

        user.last_login_at = datetime.now(timezone.utc)

        raw_refresh, refresh_hash = generate_refresh_token()
        session_expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.SESSION_MAX_DURATION_HOURS)
        refresh_record = RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=session_expires_at,
        )
        self.db.add(refresh_record)
        await self.db.flush()

        # Fire-and-forget in a separate session — must not block or fail login
        asyncio.ensure_future(_write_auth_audit(user.id, "login", ip, user_agent))

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

        # Rotate: revoke old, issue new — carry forward the original session deadline
        record.revoked = True
        raw_new, hash_new = generate_refresh_token()
        new_record = RefreshToken(
            user_id=user.id,
            token_hash=hash_new,
            expires_at=record.expires_at,  # Preserve the absolute 12h session deadline, never extend
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

        # Fire-and-forget in a separate session — must not block or fail logout
        if user_id:
            asyncio.ensure_future(_write_auth_audit(user_id, "logout", ip, user_agent))

    async def forgot_password(self, email: str) -> Optional[tuple[User, str]]:
        """Returns (user, raw_token) or None if user not found (silently succeed for security).

        A minimum constant delay is applied regardless of whether the user exists so that
        timing differences cannot be used to enumerate valid email addresses.
        """
        import time
        _start = time.monotonic()
        _MIN_RESPONSE_TIME = 0.1  # seconds — enough to mask DB + token-gen variance

        result = await self.db.execute(
            select(User).where(User.email == email.lower(), User.is_deleted == False, User.is_active == True)
        )
        user = result.scalar_one_or_none()
        if not user:
            elapsed = time.monotonic() - _start
            if elapsed < _MIN_RESPONSE_TIME:
                await asyncio.sleep(_MIN_RESPONSE_TIME - elapsed)
            return None

        raw_token, token_hash = generate_secure_token()
        record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=password_reset_expire(),
        )
        self.db.add(record)
        await self.db.flush()

        elapsed = time.monotonic() - _start
        if elapsed < _MIN_RESPONSE_TIME:
            await asyncio.sleep(_MIN_RESPONSE_TIME - elapsed)
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
