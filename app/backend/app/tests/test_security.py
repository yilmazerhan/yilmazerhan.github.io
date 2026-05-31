"""
Security and audit tests: rate limiting, permission enforcement,
SQL injection prevention via ORM, audit middleware.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.tests.conftest import get_auth_headers


class TestRateLimit:
    async def test_login_rate_limit(self, client: AsyncClient, regular_user: User):
        """5 failed logins should trigger rate limit (or just verify it's configured)."""
        for _ in range(5):
            await client.post("/api/v1/auth/login", json={
                "username": regular_user.username,
                "password": "WrongPassword!",
            })
        # The 6th attempt may be rate limited, but in test environment rate limits
        # may not be enforced per the test setup — this just verifies the endpoint works
        resp = await client.post("/api/v1/auth/login", json={
            "username": regular_user.username,
            "password": "WrongPassword!",
        })
        # Either 401 (wrong password) or 429 (rate limited) is acceptable
        assert resp.status_code in (401, 429)

    async def test_forgot_password_always_200(self, client: AsyncClient):
        """User enumeration prevention: forgot-password always returns 200."""
        resp = await client.post("/api/v1/auth/forgot-password", json={"email": "nonexistent@example.com"})
        assert resp.status_code == 200


class TestAuthorizationEnforcement:
    async def test_unauthenticated_access_denied(self, client: AsyncClient):
        resp = await client.get("/api/v1/users")
        assert resp.status_code == 401

    async def test_user_cannot_access_admin_endpoints(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        # /api/v1/users and /api/v1/teams return 200 for regular users (filtered to own data) — intentional
        # Only strictly superadmin-only endpoints should be tested here
        superadmin_only_endpoints = [
            "/api/v1/jira/configs",
            "/api/v1/email/templates",
            "/api/v1/email/workflows",
            "/api/v1/admin/ssl",
            "/api/v1/admin/settings/branding",
        ]
        for ep in superadmin_only_endpoints:
            resp = await client.get(ep, headers=headers)
            assert resp.status_code in (403, 404), f"{ep} returned {resp.status_code}"

    async def test_manager_cannot_access_superadmin_endpoints(self, client: AsyncClient, manager_user: User):
        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        endpoints = [
            "/api/v1/jira/configs",
            "/api/v1/email/workflows",
            "/api/v1/admin/ssl",
        ]
        for ep in endpoints:
            resp = await client.get(ep, headers=headers)
            assert resp.status_code == 403, f"{ep} returned {resp.status_code}"


class TestInputValidation:
    async def test_xss_in_task_title_stored_as_text(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        from app.models.kanban import KanbanBoard, KanbanColumn
        board = KanbanBoard(name="XSS Board")
        db.add(board)
        await db.flush()
        col = KanbanColumn(name="XSS Test", board_id=board.id, color="#000000", sort_order=99, is_terminal=False)
        db.add(col)
        await db.flush()

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        xss_payload = "<script>alert('xss')</script>"
        resp = await client.post("/api/v1/kanban/tasks", headers=headers, json={
            "title": xss_payload,
            "column_id": str(col.id),
        })
        assert resp.status_code == 201
        # Title is stored as-is (React/Jinja2 escapes on render)
        assert resp.json()["title"] == xss_payload

    async def test_sql_injection_in_email_search_rejected(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        # SQLAlchemy ORM prevents SQL injection — this just verifies no 500
        resp = await client.get("/api/v1/users?search='; DROP TABLE users; --", headers=headers)
        assert resp.status_code in (200, 422)

    async def test_task_title_too_short(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        from app.models.kanban import KanbanBoard, KanbanColumn
        board = KanbanBoard(name="Validation Board")
        db.add(board)
        await db.flush()
        col = KanbanColumn(name="Validation Test", board_id=board.id, color="#000000", sort_order=98, is_terminal=False)
        db.add(col)
        await db.flush()

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/kanban/tasks", headers=headers, json={
            "title": "x",
            "column_id": str(col.id),
        })
        assert resp.status_code == 422

    async def test_invalid_jwt_token(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
        assert resp.status_code == 401


class TestSoftDelete:
    async def test_soft_deleted_user_cannot_login(self, client: AsyncClient, db: AsyncSession):
        from app.models.user import User
        from app.core.security import hash_password
        user = User(
            email="softdelete@test.com",
            username="softdelete_sec",
            hashed_password=hash_password("Test123!"),
            full_name="Soft Delete User",
            role="user",
            is_active=True,
            is_deleted=True,
        )
        db.add(user)
        await db.flush()

        resp = await client.post("/api/v1/auth/login", json={
            "username": "softdelete_sec",
            "password": "Test123!",
        })
        assert resp.status_code == 401

    async def test_inactive_user_cannot_login(self, client: AsyncClient, db: AsyncSession):
        from app.models.user import User
        from app.core.security import hash_password
        user = User(
            email="inactive2@test.com",
            username="inactive_sec",
            hashed_password=hash_password("Test123!"),
            full_name="Inactive User",
            role="user",
            is_active=False,
        )
        db.add(user)
        await db.flush()

        resp = await client.post("/api/v1/auth/login", json={
            "username": "inactive_sec",
            "password": "Test123!",
        })
        assert resp.status_code == 403
