import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User, PasswordResetToken
from app.core.security import hash_token


class TestRegister:
    async def test_register_success(self, client: AsyncClient, db: AsyncSession):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "newuser@test.com",
            "password": "NewUser123!",
            "full_name": "Yeni Kullanıcı",
        })
        assert resp.status_code == 201
        assert "aktivasyon" in resp.json()["message"].lower()

    async def test_register_duplicate_email(self, client: AsyncClient, regular_user: User):
        resp = await client.post("/api/v1/auth/register", json={
            "email": regular_user.email,
            "password": "Another123!",
            "full_name": "Başka Kullanıcı",
        })
        assert resp.status_code == 409

    async def test_register_weak_password(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "weak@test.com",
            "password": "weak",
            "full_name": "Zayıf Şifre",
        })
        assert resp.status_code == 422

    async def test_register_invalid_email(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "password": "Valid123!",
            "full_name": "Test",
        })
        assert resp.status_code == 422


class TestLogin:
    async def test_login_success(self, client: AsyncClient, regular_user: User):
        resp = await client.post("/api/v1/auth/login", json={
            "username": regular_user.username,
            "password": "User123!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "refresh_token" in resp.cookies

    async def test_login_wrong_password(self, client: AsyncClient, regular_user: User):
        resp = await client.post("/api/v1/auth/login", json={
            "username": regular_user.username,
            "password": "WrongPass123!",
        })
        assert resp.status_code == 401

    async def test_login_inactive_user(self, client: AsyncClient, db: AsyncSession):
        from app.core.security import hash_password
        inactive = User(
            email="inactive@test.com",
            username="inactive_test",
            hashed_password=hash_password("Test123!"),
            full_name="Inactive",
            role="user",
            is_active=False,
        )
        db.add(inactive)
        await db.flush()

        resp = await client.post("/api/v1/auth/login", json={
            "username": "inactive_test",
            "password": "Test123!",
        })
        assert resp.status_code == 403

    async def test_login_nonexistent_user(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={
            "username": "ghost_user",
            "password": "Ghost123!",
        })
        assert resp.status_code == 401


class TestPasswordSecurity:
    async def test_password_not_plaintext_in_db(self, db: AsyncSession, regular_user: User):
        result = await db.execute(select(User).where(User.id == regular_user.id))
        user = result.scalar_one()
        assert user.hashed_password != "User123!"
        assert user.hashed_password.startswith("$argon2")

    async def test_get_me_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    async def test_get_me_success(self, client: AsyncClient, regular_user: User):
        resp = await client.post("/api/v1/auth/login", json={
            "username": regular_user.username,
            "password": "User123!",
        })
        token = resp.json()["access_token"]

        me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == regular_user.email


class TestRefreshToken:
    async def test_refresh_issues_new_token(self, client: AsyncClient, regular_user: User):
        login_resp = await client.post("/api/v1/auth/login", json={
            "username": regular_user.username,
            "password": "User123!",
        })
        assert login_resp.status_code == 200

        refresh_resp = await client.post("/api/v1/auth/refresh")
        assert refresh_resp.status_code == 200
        assert "access_token" in refresh_resp.json()

    async def test_refresh_without_cookie_fails(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/refresh")
        assert resp.status_code == 401


class TestForgotPassword:
    async def test_forgot_password_always_returns_200(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/forgot-password", json={"email": "ghost@test.com"})
        assert resp.status_code == 200
        assert "gönderildi" in resp.json()["message"]

    async def test_reset_password_invalid_token(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/reset-password", json={
            "token": "invalid-token",
            "new_password": "NewPass123!",
        })
        assert resp.status_code in (404, 422)

    async def test_reset_password_flow(self, client: AsyncClient, db: AsyncSession):
        from app.services.auth_service import AuthService
        from app.core.security import hash_password
        user = User(
            email="reset@test.com",
            username="reset_user",
            hashed_password=hash_password("Old123!"),
            full_name="Reset User",
            role="user",
            is_active=True,
        )
        db.add(user)
        await db.flush()

        svc = AuthService(db)
        result = await svc.forgot_password("reset@test.com")
        assert result is not None
        _, raw_token = result

        resp = await client.post("/api/v1/auth/reset-password", json={
            "token": raw_token,
            "new_password": "NewPass123!",
        })
        assert resp.status_code == 200

        # Old password no longer works
        login_old = await client.post("/api/v1/auth/login", json={
            "username": "reset_user",
            "password": "Old123!",
        })
        assert login_old.status_code == 401

        # New password works
        login_new = await client.post("/api/v1/auth/login", json={
            "username": "reset_user",
            "password": "NewPass123!",
        })
        assert login_new.status_code == 200
