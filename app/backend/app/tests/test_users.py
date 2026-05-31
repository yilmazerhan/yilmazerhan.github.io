import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.user import User
from app.models.team import Team
from app.models.user_team import user_teams
from app.tests.conftest import get_auth_headers


class TestUserCRUD:
    async def test_superadmin_can_list_users(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/users", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    async def test_regular_user_cannot_list_users(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/users", headers=headers)
        assert resp.status_code == 200
        # Regular users see only themselves (not in any team)
        for item in resp.json()["items"]:
            assert item["id"] == str(regular_user.id)

    async def test_superadmin_can_create_user(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/users", headers=headers, json={
            "email": "new@test.com",
            "full_name": "Yeni Kullanıcı",
            "role": "user",
        })
        assert resp.status_code == 201
        assert resp.json()["email"] == "new@test.com"

    async def test_regular_user_cannot_create_user(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/users", headers=headers, json={
            "email": "another@test.com",
            "full_name": "Başka Kullanıcı",
        })
        assert resp.status_code == 403

    async def test_duplicate_email_rejected(self, client: AsyncClient, superadmin_user: User, regular_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/users", headers=headers, json={
            "email": regular_user.email,
            "full_name": "Duplicate",
        })
        assert resp.status_code == 409

    async def test_soft_delete_user(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.core.security import hash_password
        target = User(
            email="todelete@test.com",
            username="todelete_user",
            hashed_password=hash_password("Delete123!"),
            full_name="To Delete",
            role="user",
            is_active=True,
        )
        db.add(target)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.delete(f"/api/v1/users/{target.id}", headers=headers)
        assert resp.status_code == 200

        result = await db.execute(select(User).where(User.id == target.id))
        deleted = result.scalar_one()
        assert deleted.is_deleted is True
        assert deleted.is_active is False

    async def test_cannot_delete_self(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.delete(f"/api/v1/users/{superadmin_user.id}", headers=headers)
        assert resp.status_code == 403


class TestProfileUpdate:
    async def test_update_own_profile(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.patch("/api/v1/users/me/profile", headers=headers, json={
            "full_name": "Güncellenmiş Ad",
            "preferred_theme": "dark",
            "preferred_language": "en",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["full_name"] == "Güncellenmiş Ad"
        assert data["preferred_theme"] == "dark"
        assert data["preferred_language"] == "en"

    async def test_change_password_success(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/users/me/change-password", headers=headers, json={
            "old_password": "User123!",
            "new_password": "NewUser456@",
        })
        assert resp.status_code == 200

        # New password works
        login = await client.post("/api/v1/auth/login", json={
            "username": regular_user.username,
            "password": "NewUser456@",
        })
        assert login.status_code == 200

    async def test_change_password_wrong_old(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/users/me/change-password", headers=headers, json={
            "old_password": "WrongOld123!",
            "new_password": "NewPass789#",
        })
        assert resp.status_code == 403


class TestTeams:
    async def test_create_team(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/teams", headers=headers, json={
            "name": "Yazılım Ekibi",
            "description": "Ana geliştirme ekibi",
        })
        assert resp.status_code == 201
        assert resp.json()["name"] == "Yazılım Ekibi"

    async def test_duplicate_team_name_rejected(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        team = Team(name="Unique Team")
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/teams", headers=headers, json={"name": "Unique Team"})
        assert resp.status_code == 409

    async def test_add_member_to_team(self, client: AsyncClient, superadmin_user: User, regular_user: User, db: AsyncSession):
        team = Team(name="Test Ekibi")
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post(
            f"/api/v1/teams/{team.id}/members",
            headers=headers,
            json={"user_id": str(regular_user.id)},
        )
        assert resp.status_code == 200

        result = await db.execute(select(User).where(User.id == regular_user.id))
        updated = result.scalar_one()
        assert str(updated.team_id) == str(team.id)

    async def test_manager_can_only_see_own_team(
        self, client: AsyncClient, manager_user: User, db: AsyncSession
    ):
        team = Team(name="Yönetici Ekibi", manager_id=manager_user.id)
        db.add(team)
        await db.flush()
        manager_user.team_id = team.id
        await db.flush()
        # Insert into user_teams junction table (required for team_service.list_teams scoping)
        await db.execute(
            pg_insert(user_teams)
            .values(user_id=manager_user.id, team_id=team.id)
            .on_conflict_do_nothing()
        )
        await db.flush()

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/teams", headers=headers)
        assert resp.status_code == 200
        # Manager only sees their own team
        assert resp.json()["total"] == 1


class TestPermissions:
    async def test_superadmin_can_set_overrides(
        self, client: AsyncClient, superadmin_user: User, regular_user: User
    ):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.put(
            f"/api/v1/permissions/users/{regular_user.id}",
            headers=headers,
            json={"overrides": [
                {"module": "user_management", "action": "view", "is_allowed": True},
            ]},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_effective_permissions_superadmin(
        self, client: AsyncClient, superadmin_user: User
    ):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get(
            f"/api/v1/permissions/effective/{superadmin_user.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        perms = resp.json()["permissions"]
        assert perms["worklog"]["create"] is True
        assert perms["user_management"]["delete"] is True

    async def test_effective_permissions_regular_user(
        self, client: AsyncClient, superadmin_user: User, regular_user: User
    ):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get(
            f"/api/v1/permissions/effective/{regular_user.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        perms = resp.json()["permissions"]
        assert perms["user_management"]["create"] is False
        assert perms["worklog"]["create"] is True

    async def test_override_grants_access(
        self, client: AsyncClient, superadmin_user: User, regular_user: User
    ):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        # Grant user management view
        await client.put(
            f"/api/v1/permissions/users/{regular_user.id}",
            headers=headers,
            json={"overrides": [
                {"module": "user_management", "action": "view", "is_allowed": True},
            ]},
        )
        perms_resp = await client.get(
            f"/api/v1/permissions/effective/{regular_user.id}",
            headers=headers,
        )
        assert perms_resp.json()["permissions"]["user_management"]["view"] is True

    async def test_cannot_change_superadmin_permissions(
        self, client: AsyncClient, superadmin_user: User
    ):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.put(
            f"/api/v1/permissions/users/{superadmin_user.id}",
            headers=headers,
            json={"overrides": [{"module": "worklog", "action": "delete", "is_allowed": False}]},
        )
        assert resp.status_code == 422
