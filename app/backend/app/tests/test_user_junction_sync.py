"""
Tests that verify user_service.create_user and update_user correctly sync
the user_teams junction table so team-manager worklog/user queries work.

Root cause of the bug:
  create_user() and update_user() set users.team_id but did NOT insert a row
  into user_teams.  worklog_service.list_logs() and user_service.list_users()
  both use the junction table for team-manager scoping, so any user created
  (or moved to a team) via the service methods was invisible to team managers.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.user import User
from app.models.team import Team
from app.models.worklog import WorkType, WorkLog
from app.models.user_team import user_teams
from app.core.security import hash_password
from app.tests.conftest import get_auth_headers

from datetime import date, timedelta


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def make_work_type(db: AsyncSession, name: str = "Junction Sync Test") -> WorkType:
    wt = WorkType(name=name, color="#f59e0b", sort_order=99)
    db.add(wt)
    await db.flush()
    return wt


async def make_worklog(db: AsyncSession, user_id, work_type_id, days_ago: int = 0) -> WorkLog:
    log = WorkLog(
        user_id=user_id,
        work_type_id=work_type_id,
        log_date=date.today() - timedelta(days=days_ago),
        duration_hours=1.5,
        description="Junction sync test log",
    )
    db.add(log)
    await db.flush()
    return log


class TestUserServiceJunctionSync:
    """
    Verifies that create_user and update_user keep user_teams in sync so that
    team-manager scoping in worklog and user-list endpoints works correctly.
    """

    async def test_create_user_with_team_inserts_junction(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        """
        When superadmin creates a user with team_id set, that user must appear
        in user_teams so team-manager queries can find them.
        """
        # Create a team and promote a manager
        manager = User(
            email="jmgr_create@test.com",
            username="jmgr.create",
            hashed_password=hash_password("Manager123!"),
            full_name="Junction Create Manager",
            role="team_manager",
            is_active=True,
        )
        db.add(manager)
        team = Team(name="Junction Create Team", manager_id=None)
        db.add(team)
        await db.flush()
        manager.team_id = team.id
        team.manager_id = manager.id
        await db.flush()
        # Add manager to junction table (as team_service would do)
        await db.execute(
            pg_insert(user_teams)
            .values(user_id=manager.id, team_id=team.id)
            .on_conflict_do_nothing()
        )
        await db.commit()

        # Superadmin creates a user assigned to that team via the API
        admin_headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/users", headers=admin_headers, json={
            "email": "jnew_create@test.com",
            "full_name": "Junction New User",
            "role": "user",
            "team_id": str(team.id),
        })
        assert resp.status_code == 201, resp.text
        new_user_id = resp.json()["id"]

        # Verify the junction table was updated
        row = await db.execute(
            select(user_teams.c.user_id).where(
                user_teams.c.user_id == new_user_id,
                user_teams.c.team_id == team.id,
            )
        )
        assert row.scalar_one_or_none() is not None, (
            "create_user did not insert the new user into user_teams junction table"
        )

    async def test_manager_sees_user_created_with_team_id(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        """
        After a user is created with team_id via the API, a team manager from
        that team must be able to see the user in GET /users.
        """
        manager = User(
            email="jmgr_vis@test.com",
            username="jmgr.vis",
            hashed_password=hash_password("Manager123!"),
            full_name="Junction Visibility Manager",
            role="team_manager",
            is_active=True,
        )
        db.add(manager)
        team = Team(name="Junction Visibility Team", manager_id=None)
        db.add(team)
        await db.flush()
        manager.team_id = team.id
        team.manager_id = manager.id
        await db.flush()
        await db.execute(
            pg_insert(user_teams)
            .values(user_id=manager.id, team_id=team.id)
            .on_conflict_do_nothing()
        )
        await db.commit()

        # Superadmin creates a team member
        admin_headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/users", headers=admin_headers, json={
            "email": "jnew_vis@test.com",
            "full_name": "Junction Visible Member",
            "role": "user",
            "team_id": str(team.id),
        })
        assert resp.status_code == 201
        new_user_id = resp.json()["id"]

        # Manager fetches the user list — must include the new member
        mgr_headers = await get_auth_headers(client, manager.email, "Manager123!")
        resp = await client.get("/api/v1/users", headers=mgr_headers)
        assert resp.status_code == 200
        ids = [u["id"] for u in resp.json()["items"]]
        assert new_user_id in ids, (
            "Team manager cannot see team member that was created with team_id set — "
            "user_teams junction table was not updated by create_user()"
        )

    async def test_manager_sees_worklog_of_user_created_with_team_id(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        """
        A worklog written by a user who was created with team_id must be visible
        to the team manager of that team.
        """
        manager = User(
            email="jmgr_wl@test.com",
            username="jmgr.wl",
            hashed_password=hash_password("Manager123!"),
            full_name="Junction WL Manager",
            role="team_manager",
            is_active=True,
        )
        db.add(manager)
        team = Team(name="Junction WL Team", manager_id=None)
        db.add(team)
        await db.flush()
        manager.team_id = team.id
        team.manager_id = manager.id
        await db.flush()
        await db.execute(
            pg_insert(user_teams)
            .values(user_id=manager.id, team_id=team.id)
            .on_conflict_do_nothing()
        )
        await db.commit()

        # Superadmin creates a team member
        admin_headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/users", headers=admin_headers, json={
            "email": "jnew_wl@test.com",
            "full_name": "Junction WL Member",
            "role": "user",
            "team_id": str(team.id),
        })
        assert resp.status_code == 201
        new_user_id = resp.json()["id"]

        # Create a work-type and a worklog for that member
        wt = await make_work_type(db, "Junction WL Type")
        log = await make_worklog(db, new_user_id, wt.id, days_ago=1)
        await db.commit()

        # Manager fetches worklogs — must include the member's log
        mgr_headers = await get_auth_headers(client, manager.email, "Manager123!")
        resp = await client.get("/api/v1/worklogs", headers=mgr_headers)
        assert resp.status_code == 200
        log_ids = [item["id"] for item in resp.json()["items"]]
        assert str(log.id) in log_ids, (
            "Team manager cannot see team member's worklog — "
            "user_teams junction table was not updated by create_user()"
        )

    async def test_update_user_team_id_inserts_junction(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        """
        When superadmin changes a user's team_id via PATCH /users/{id},
        the new team should appear in user_teams for that user.
        """
        user = User(
            email="jmv_update@test.com",
            username="jmv.update",
            hashed_password=hash_password("User123!"),
            full_name="Junction Update User",
            role="user",
            is_active=True,
        )
        db.add(user)
        new_team = Team(name="Junction Update Team")
        db.add(new_team)
        await db.flush()
        await db.commit()

        admin_headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/users/{user.id}", headers=admin_headers, json={
            "team_id": str(new_team.id),
        })
        assert resp.status_code == 200, resp.text

        # Verify junction table entry was created
        row = await db.execute(
            select(user_teams.c.user_id).where(
                user_teams.c.user_id == user.id,
                user_teams.c.team_id == new_team.id,
            )
        )
        assert row.scalar_one_or_none() is not None, (
            "update_user did not insert the updated team into user_teams junction table"
        )
