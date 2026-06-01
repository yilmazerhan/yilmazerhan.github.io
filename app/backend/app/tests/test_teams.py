import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.team import Team
from app.tests.conftest import get_auth_headers


class TestTeamCRUD:
    async def test_superadmin_can_list_teams(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/teams", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    async def test_superadmin_can_create_team(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/teams", headers=headers, json={
            "name": "Test Team Alpha",
            "description": "Alpha test team",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Team Alpha"
        assert data["description"] == "Alpha test team"

    async def test_duplicate_team_name_rejected(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        await client.post("/api/v1/teams", headers=headers, json={"name": "Unique Team"})
        resp = await client.post("/api/v1/teams", headers=headers, json={"name": "Unique Team"})
        assert resp.status_code == 409

    async def test_superadmin_can_get_team(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        team = Team(name="Get Test Team")
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get(f"/api/v1/teams/{team.id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == str(team.id)

    async def test_update_team_name(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        team = Team(name="Original Name")
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/teams/{team.id}", headers=headers, json={
            "name": "Updated Name",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    async def test_update_team_with_manager_no_500(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        """Regression test: updating a team's manager must not raise MissingGreenlet (500)."""
        from app.core.security import hash_password

        manager = User(
            email="mgr.team@test.com",
            username="mgr_team_test",
            hashed_password=hash_password("Mgr123!"),
            full_name="New Manager",
            role="user",
            is_active=True,
        )
        db.add(manager)
        team = Team(name="Manager Update Team")
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/teams/{team.id}", headers=headers, json={
            "manager_id": str(manager.id),
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["manager_id"] == str(manager.id)

    async def test_update_team_manager_role_promoted(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        """A 'user' role user set as manager should be promoted to team_manager."""
        from app.core.security import hash_password

        new_manager = User(
            email="promoted@test.com",
            username="promoted_test",
            hashed_password=hash_password("Promo123!"),
            full_name="To Promote",
            role="user",
            is_active=True,
        )
        db.add(new_manager)
        team = Team(name="Promotion Team")
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/teams/{team.id}", headers=headers, json={
            "manager_id": str(new_manager.id),
        })
        assert resp.status_code == 200

        # Refresh to get updated role
        await db.refresh(new_manager)
        assert new_manager.role == "team_manager"

    async def test_update_team_with_existing_manager(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        """Updating a team that already has a manager to a different manager must not 500."""
        from app.core.security import hash_password

        first_manager = User(
            email="first.mgr@test.com",
            username="first_mgr_test",
            hashed_password=hash_password("First123!"),
            full_name="First Manager",
            role="team_manager",
            is_active=True,
        )
        second_manager = User(
            email="second.mgr@test.com",
            username="second_mgr_test",
            hashed_password=hash_password("Second123!"),
            full_name="Second Manager",
            role="team_manager",
            is_active=True,
        )
        db.add(first_manager)
        db.add(second_manager)
        team = Team(name="Two Manager Team", manager_id=None)
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        # Set first manager
        resp = await client.patch(f"/api/v1/teams/{team.id}", headers=headers, json={
            "manager_id": str(first_manager.id),
        })
        assert resp.status_code == 200, f"First manager set failed: {resp.text}"

        # Switch to second manager — this triggers the junction table path again
        resp = await client.patch(f"/api/v1/teams/{team.id}", headers=headers, json={
            "manager_id": str(second_manager.id),
        })
        assert resp.status_code == 200, f"Second manager switch failed: {resp.text}"
        assert resp.json()["manager_id"] == str(second_manager.id)

    async def test_delete_empty_team(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        team = Team(name="Delete Me Team")
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.delete(f"/api/v1/teams/{team.id}", headers=headers)
        assert resp.status_code == 200

    async def test_add_member_to_team(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.core.security import hash_password

        member = User(
            email="member.team@test.com",
            username="member_team_test",
            hashed_password=hash_password("Member123!"),
            full_name="Team Member",
            role="user",
            is_active=True,
        )
        db.add(member)
        team = Team(name="Add Member Team")
        db.add(team)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post(
            f"/api/v1/teams/{team.id}/members",
            headers=headers,
            json={"user_id": str(member.id)},
        )
        assert resp.status_code == 200

    async def test_regular_user_cannot_manage_teams(
        self, client: AsyncClient, regular_user: User
    ):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/teams", headers=headers, json={"name": "Forbidden Team"})
        assert resp.status_code == 403
