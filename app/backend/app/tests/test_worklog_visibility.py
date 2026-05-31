"""
Tests for worklog visibility scoping:
- superadmin sees all logs
- regular user sees only own logs
- manager sees own and team-member logs (via user_teams junction table)
- manager cannot see logs from a different team
- stats summary respects the same scoping rules
"""
import pytest
from datetime import date, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.user import User
from app.models.team import Team
from app.models.worklog import WorkType, WorkLog
from app.models.user_team import user_teams
from app.core.security import hash_password
from app.tests.conftest import get_auth_headers


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def create_work_type(db: AsyncSession, name: str = "Visibility Test İşi") -> WorkType:
    wt = WorkType(name=name, color="#6366f1", sort_order=99)
    db.add(wt)
    await db.flush()
    return wt


async def create_log(
    db: AsyncSession,
    user_id,
    work_type_id,
    days_ago: int = 0,
    duration_hours: float = 2.0,
) -> WorkLog:
    log = WorkLog(
        user_id=user_id,
        work_type_id=work_type_id,
        log_date=date.today() - timedelta(days=days_ago),
        duration_hours=duration_hours,
        description="Görünürlük testi açıklaması",
    )
    db.add(log)
    await db.flush()
    return log


async def make_user(
    db: AsyncSession,
    email: str,
    username: str,
    role: str = "user",
    password: str = "Test123!",
) -> User:
    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(password),
        full_name=f"Test {username}",
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def assign_to_team(db: AsyncSession, user_id, team_id) -> None:
    """Insert into user_teams junction table and also update users.team_id."""
    await db.execute(
        pg_insert(user_teams)
        .values(user_id=user_id, team_id=team_id)
        .on_conflict_do_nothing()
    )
    await db.flush()


# ─── Test class ───────────────────────────────────────────────────────────────

class TestWorklogVisibility:

    async def test_superadmin_sees_all_logs(
        self, client: AsyncClient, superadmin_user: User, regular_user: User, db: AsyncSession
    ):
        """Superadmin's list endpoint returns logs from every user."""
        wt = await create_work_type(db, "SA All Logs")
        await create_log(db, superadmin_user.id, wt.id, days_ago=0)
        await create_log(db, regular_user.id, wt.id, days_ago=1)

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/worklogs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 2

        user_ids = {item["user_id"] for item in data["items"]}
        assert str(superadmin_user.id) in user_ids
        assert str(regular_user.id) in user_ids

    async def test_regular_user_sees_only_own_logs(
        self, client: AsyncClient, regular_user: User, superadmin_user: User, db: AsyncSession
    ):
        """List endpoint for a regular user returns only their own entries."""
        wt = await create_work_type(db, "Own Only Logs")
        await create_log(db, regular_user.id, wt.id, days_ago=0)
        # Create a log for a different user — should NOT appear
        await create_log(db, superadmin_user.id, wt.id, days_ago=0)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/worklogs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        for item in data["items"]:
            assert item["user_id"] == str(regular_user.id), (
                f"Regular user received log from another user: {item['user_id']}"
            )

    async def test_manager_sees_own_logs(
        self, client: AsyncClient, manager_user: User, db: AsyncSession
    ):
        """Manager can see their own logs via the list endpoint."""
        wt = await create_work_type(db, "Manager Own Logs")
        await create_log(db, manager_user.id, wt.id, days_ago=0)

        # Put manager in a team so the scoping subquery works correctly
        team = Team(name="Yönetici Kendi Takımı Vis", manager_id=manager_user.id)
        db.add(team)
        await db.flush()
        manager_user.team_id = team.id
        await db.flush()
        await assign_to_team(db, manager_user.id, team.id)

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/worklogs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        own_ids = [item["user_id"] for item in data["items"]]
        assert str(manager_user.id) in own_ids

    async def test_manager_sees_team_member_logs(
        self, client: AsyncClient, manager_user: User, regular_user: User, db: AsyncSession
    ):
        """Manager can see logs of users who share a team via user_teams junction table."""
        team = Team(name="Shared Team Vis", manager_id=manager_user.id)
        db.add(team)
        await db.flush()
        manager_user.team_id = team.id
        regular_user.team_id = team.id
        await db.flush()
        await assign_to_team(db, manager_user.id, team.id)
        await assign_to_team(db, regular_user.id, team.id)

        wt = await create_work_type(db, "Member Visible Log")
        member_log = await create_log(db, regular_user.id, wt.id, days_ago=1)

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/worklogs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        log_ids = [item["id"] for item in data["items"]]
        assert str(member_log.id) in log_ids, (
            "Manager should see team member's worklog but it was not returned."
        )

    async def test_manager_cannot_see_other_team_logs(
        self, client: AsyncClient, manager_user: User, db: AsyncSession
    ):
        """Manager cannot see logs from users in a completely different team."""
        # Manager's own team
        my_team = Team(name="Manager Own Team Vis", manager_id=manager_user.id)
        db.add(my_team)
        await db.flush()
        manager_user.team_id = my_team.id
        await db.flush()
        await assign_to_team(db, manager_user.id, my_team.id)

        # Other team with a separate user
        other_user = await make_user(db, "other_vis@test.com", "other.vis.user")
        other_team = Team(name="Other Team Vis")
        db.add(other_team)
        await db.flush()
        other_user.team_id = other_team.id
        await db.flush()
        await assign_to_team(db, other_user.id, other_team.id)

        wt = await create_work_type(db, "Other Team Log")
        other_log = await create_log(db, other_user.id, wt.id, days_ago=0)

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/worklogs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        log_ids = [item["id"] for item in data["items"]]
        assert str(other_log.id) not in log_ids, (
            "Manager should NOT see logs from users in another team."
        )

    async def test_manager_stats_includes_team_members(
        self, client: AsyncClient, manager_user: User, regular_user: User, db: AsyncSession
    ):
        """Stats summary for a manager includes hours from team members."""
        team = Team(name="Stats Team Vis", manager_id=manager_user.id)
        db.add(team)
        await db.flush()
        manager_user.team_id = team.id
        regular_user.team_id = team.id
        await db.flush()
        await assign_to_team(db, manager_user.id, team.id)
        await assign_to_team(db, regular_user.id, team.id)

        wt = await create_work_type(db, "Stats Include Test")
        await create_log(db, regular_user.id, wt.id, days_ago=0, duration_hours=3.0)

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/worklogs/stats/summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_hours" in data
        assert data["total_hours"] >= 3.0, (
            f"Manager stats total_hours should include member hours (>=3.0), got {data['total_hours']}"
        )

    async def test_manager_stats_excludes_other_teams(
        self, client: AsyncClient, manager_user: User, db: AsyncSession
    ):
        """Stats summary for a manager does NOT include hours from other teams."""
        # Set up manager's team (empty — no members other than the manager)
        my_team = Team(name="Manager Stats Excl Team", manager_id=manager_user.id)
        db.add(my_team)
        await db.flush()
        manager_user.team_id = my_team.id
        await db.flush()
        await assign_to_team(db, manager_user.id, my_team.id)

        # Other team user with logs
        outsider = await make_user(db, "outsider_stats@test.com", "outsider.stats")
        other_team = Team(name="Outsider Stats Team")
        db.add(other_team)
        await db.flush()
        outsider.team_id = other_team.id
        await db.flush()
        await assign_to_team(db, outsider.id, other_team.id)

        wt = await create_work_type(db, "Excluded Stats Hours")
        # Outsider logs 10 hours — should NOT show in manager's stats
        await create_log(db, outsider.id, wt.id, days_ago=0, duration_hours=10.0)

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/worklogs/stats/summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        # Manager has no logs of their own in this test, so total should be 0
        # (or at least NOT 10 from the outsider)
        for entry in data.get("by_type", []):
            if entry["name"] == "Excluded Stats Hours":
                assert False, (
                    "Manager stats should not contain hours from users in other teams."
                )
        # If by_type is empty, that's also correct
        assert data["total_hours"] < 10.0, (
            "Manager's total_hours should not include outsider team's 10 hours."
        )
