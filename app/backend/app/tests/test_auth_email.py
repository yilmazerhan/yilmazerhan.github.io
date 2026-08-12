"""
Tests for send_auth_email_direct — the new direct email sending function
that replaces the Celery chain for transactional auth emails.
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession


class TestSendAuthEmailDirect:
    """Unit tests for send_auth_email_direct that mock SMTP."""

    async def _create_smtp_config(self, db: AsyncSession):
        from app.models.email_config import SmtpConfig
        from app.core.security import encrypt_field
        from app.config import settings
        cfg = SmtpConfig(
            host="smtp.test.com",
            port=587,
            username="user@test.com",
            password_encrypted=encrypt_field("secret", settings.SMTP_ENCRYPTION_KEY),
            use_tls=True,
            use_ssl=False,
            from_email="noreply@test.com",
            from_name="Test App",
            is_active=True,
        )
        db.add(cfg)
        await db.flush()
        return cfg

    async def test_sends_via_tls_when_smtp_configured(self, db: AsyncSession):
        from app.tasks.email_tasks import send_auth_email_direct

        await self._create_smtp_config(db)
        await db.commit()

        mock_server = MagicMock()
        with patch("smtplib.SMTP", return_value=mock_server):
            await send_auth_email_direct(
                template_slug="account_activation",
                to_email="dest@test.com",
                variables={
                    "full_name": "Test User",
                    "activation_url": "https://example.com/activate/abc",
                    "expires_in": 48,
                },
            )

        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once()
        mock_server.sendmail.assert_called_once()

    async def test_logs_warning_when_smtp_not_configured(self, db: AsyncSession):
        from app.tasks.email_tasks import send_auth_email_direct
        import logging

        # No SMTP config in DB
        with patch("app.tasks.email_tasks.logger") as mock_logger:
            await send_auth_email_direct(
                template_slug="account_activation",
                to_email="dest@test.com",
                variables={"full_name": "X", "activation_url": "http://x", "expires_in": 48},
            )

        # Should log a warning, not raise
        mock_logger.warning.assert_called_once()
        assert "SMTP" in mock_logger.warning.call_args[0][0]

    async def test_logs_error_when_template_missing(self, db: AsyncSession):
        from app.tasks.email_tasks import send_auth_email_direct

        with patch("app.tasks.email_tasks.logger") as mock_logger:
            await send_auth_email_direct(
                template_slug="nonexistent_template_slug",
                to_email="dest@test.com",
                variables={},
            )

        mock_logger.error.assert_called_once()
        assert "template not found" in mock_logger.error.call_args[0][0]

    async def test_marks_log_failed_on_smtp_error(self, db: AsyncSession):
        from app.tasks.email_tasks import send_auth_email_direct
        from app.models.email_log import EmailLog
        from sqlalchemy import select

        await self._create_smtp_config(db)
        await db.commit()

        with patch("smtplib.SMTP", side_effect=ConnectionRefusedError("refused")):
            await send_auth_email_direct(
                template_slug="account_activation",
                to_email="fail@test.com",
                variables={
                    "full_name": "Fail User",
                    "activation_url": "http://x",
                    "expires_in": 48,
                },
            )

        # Log entry should exist with status=failed
        result = await db.execute(
            select(EmailLog).where(EmailLog.to_email == "fail@test.com")
        )
        log = result.scalar_one_or_none()
        assert log is not None
        assert log.status == "failed"
        assert "refused" in (log.error_message or "")

    async def test_marks_log_sent_on_success(self, db: AsyncSession):
        from app.tasks.email_tasks import send_auth_email_direct
        from app.models.email_log import EmailLog
        from sqlalchemy import select

        await self._create_smtp_config(db)
        await db.commit()

        mock_server = MagicMock()
        with patch("smtplib.SMTP", return_value=mock_server):
            await send_auth_email_direct(
                template_slug="password_reset",
                to_email="success@test.com",
                variables={
                    "full_name": "Success User",
                    "reset_url": "http://x/reset",
                    "expires_in": 1,
                },
            )

        result = await db.execute(
            select(EmailLog).where(EmailLog.to_email == "success@test.com")
        )
        log = result.scalar_one_or_none()
        assert log is not None
        assert log.status == "sent"
        assert log.sent_at is not None

    async def test_no_exception_raised_on_failure(self, db: AsyncSession):
        """send_auth_email_direct must never propagate exceptions — it logs and returns."""
        from app.tasks.email_tasks import send_auth_email_direct

        await self._create_smtp_config(db)
        await db.commit()

        # Even with a totally unexpected error, the function should not raise
        with patch("smtplib.SMTP", side_effect=RuntimeError("unexpected")):
            try:
                await send_auth_email_direct(
                    template_slug="account_activation",
                    to_email="noerr@test.com",
                    variables={"full_name": "X", "activation_url": "http://x", "expires_in": 48},
                )
            except Exception as e:
                pytest.fail(f"send_auth_email_direct raised an exception: {e}")


class TestAuthEmailEndpoints:
    """Integration tests: register and forgot-password return 2xx and
    the background email function is scheduled (not actually sent)."""

    async def test_register_returns_201_even_without_smtp(self, client, db: AsyncSession):
        """Registration must succeed even if SMTP is not configured."""
        resp = await client.post("/api/v1/auth/register", json={
            "email": "bgtask@test.com",
            "password": "BgTask123!",
            "full_name": "Background Task User",
        })
        assert resp.status_code == 201

    async def test_forgot_password_returns_200_even_without_smtp(
        self, client, db: AsyncSession
    ):
        """Forgot-password must return 200 even if SMTP is not configured."""
        from app.models.user import User
        from app.core.security import hash_password

        user = User(
            email="forgot_bgt@test.com",
            username="forgot_bgt_user",
            hashed_password=hash_password("Forgot123!"),
            full_name="Forgot BG",
            role="user",
            is_active=True,
        )
        db.add(user)
        await db.flush()

        resp = await client.post("/api/v1/auth/forgot-password", json={"email": user.email})
        assert resp.status_code == 200

    async def test_create_user_sends_new_account_email(
        self, client, superadmin_user, db: AsyncSession
    ):
        """Creating a user via admin API should trigger new_account email."""
        from app.tests.conftest import get_auth_headers
        from app.models.email_config import SmtpConfig
        from app.core.security import encrypt_field
        from app.config import settings

        # Configure SMTP so send_auth_email_direct proceeds past the SMTP check
        db.add(SmtpConfig(
            host="smtp.test.com", port=587, username="u",
            password_encrypted=encrypt_field("pw", settings.SMTP_ENCRYPTION_KEY),
            use_tls=True, use_ssl=False,
            from_email="no@test.com", from_name="Test",
        ))
        await db.commit()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        mock_server = MagicMock()
        with patch("smtplib.SMTP", return_value=mock_server):
            resp = await client.post("/api/v1/users", headers=headers, json={
                "email": "newaccount@test.com",
                "full_name": "New Account User",
                "role": "user",
            })

        assert resp.status_code == 201
        # BackgroundTasks run after the response in real FastAPI, but in TestClient
        # they run synchronously within the request — so we can assert here.
        mock_server.sendmail.assert_called_once()

    async def test_smtp_not_configured_does_not_break_user_creation(
        self, client, superadmin_user, db: AsyncSession
    ):
        """User creation must succeed even when SMTP is not configured."""
        from app.tests.conftest import get_auth_headers

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/users", headers=headers, json={
            "email": "nosmtp@test.com",
            "full_name": "No SMTP User",
            "role": "user",
        })
        assert resp.status_code == 201


class TestCeleryEmailTaskMissingCommitFix:
    """Regression: _send_email_async must commit the 'failed' status when SMTP is not configured."""

    async def test_log_marked_failed_and_committed_when_no_smtp(self, db: AsyncSession):
        from app.tasks.email_tasks import _send_email_async
        from app.models.email_log import EmailLog
        from sqlalchemy import select

        # Create a pending log entry
        log = EmailLog(
            to_email="test@test.com",
            subject="Test",
            status="pending",
        )
        db.add(log)
        await db.commit()
        log_id = str(log.id)

        # No SMTP config in DB → _send_email_async should mark log failed and commit
        await _send_email_async("test@test.com", "Subject", "<p>body</p>", log_id)

        # Refresh log from DB — status should be 'failed', committed
        await db.refresh(log)
        assert log.status == "failed"
        assert log.error_message is not None
        assert "SMTP" in log.error_message
