import pytest
from datetime import date, timedelta
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


async def create_work_type(db: AsyncSession, name: str = "Test İşi") -> WorkType:
    wt = WorkType(name=name, color="#3b82f6", sort_order=0)
    db.add(wt)
    await db.flush()
    return wt


async def create_log(db: AsyncSession, user_id, work_type_id, log_date=None, days_ago: int = 0) -> WorkLog:
    d = date.today() - timedelta(days=days_ago)
    log = WorkLog(
        user_id=user_id,
        work_type_id=work_type_id,
        log_date=d,
        duration_hours=2.0,
        description="Test açıklaması",
    )
    db.add(log)
    await db.flush()
    return log


class TestWorkTypes:
    async def test_list_work_types_authenticated(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/worklogs/work-types", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_work_type_superadmin(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/worklogs/work-types", headers=headers, json={
            "name": "Yeni İş Tipi",
            "color": "#ff6b6b",
        })
        assert resp.status_code == 201
        assert resp.json()["name"] == "Yeni İş Tipi"

    async def test_create_work_type_forbidden_for_user(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/worklogs/work-types", headers=headers, json={
            "name": "Yetkisiz İş",
            "color": "#000000",
        })
        assert resp.status_code == 403


class TestWorkLogCreate:
    async def test_create_log_today(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        wt = await create_work_type(db)
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/worklogs", headers=headers, json={
            "work_type_id": str(wt.id),
            "log_date": str(date.today()),
            "duration_hours": 3.5,
            "description": "Bugün yaptıklarım açıklaması",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["duration_hours"] == 3.5
        assert data["user_id"] == str(regular_user.id)

    async def test_create_log_future_date_rejected(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        wt = await create_work_type(db, "Future Test")
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        future = date.today() + timedelta(days=1)
        resp = await client.post("/api/v1/worklogs", headers=headers, json={
            "work_type_id": str(wt.id),
            "log_date": str(future),
            "duration_hours": 2.0,
            "description": "Yarın yapılacak iş açıklaması",
        })
        assert resp.status_code == 422

    async def test_create_log_invalid_duration(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        wt = await create_work_type(db, "Duration Test")
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/worklogs", headers=headers, json={
            "work_type_id": str(wt.id),
            "log_date": str(date.today()),
            "duration_hours": 0.1,
            "description": "Süre hatası testi açıklaması",
        })
        assert resp.status_code == 422


class TestWorkLogThreeDayRule:
    async def test_creator_can_edit_within_3_days(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        wt = await create_work_type(db, "3 Day Test")
        log = await create_log(db, regular_user.id, wt.id, days_ago=2)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.patch(f"/api/v1/worklogs/{log.id}", headers=headers, json={
            "description": "Güncellenmiş açıklama içeriği",
        })
        assert resp.status_code == 200

    async def test_creator_cannot_edit_after_3_days(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        wt = await create_work_type(db, "Old Log Test")
        log = await create_log(db, regular_user.id, wt.id, days_ago=4)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.patch(f"/api/v1/worklogs/{log.id}", headers=headers, json={
            "description": "Eski kaydı düzenlemeye çalışıyorum",
        })
        assert resp.status_code == 403

    async def test_manager_can_edit_old_log_of_team_member(
        self, client: AsyncClient, manager_user: User, regular_user: User, db: AsyncSession
    ):
        team = Team(name="Test Ekibi Edit", manager_id=manager_user.id)
        db.add(team)
        await db.flush()
        manager_user.team_id = team.id
        regular_user.team_id = team.id
        await db.flush()
        # Also insert into user_teams junction table (required for service-level scoping)
        await db.execute(
            pg_insert(user_teams)
            .values(user_id=manager_user.id, team_id=team.id)
            .on_conflict_do_nothing()
        )
        await db.execute(
            pg_insert(user_teams)
            .values(user_id=regular_user.id, team_id=team.id)
            .on_conflict_do_nothing()
        )
        await db.flush()

        wt = await create_work_type(db, "Manager Edit Test")
        log = await create_log(db, regular_user.id, wt.id, days_ago=5)

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.patch(f"/api/v1/worklogs/{log.id}", headers=headers, json={
            "description": "Yönetici eski kaydı düzenliyor",
        })
        assert resp.status_code == 200

    async def test_superadmin_can_edit_any_old_log(
        self, client: AsyncClient, superadmin_user: User, regular_user: User, db: AsyncSession
    ):
        wt = await create_work_type(db, "Superadmin Edit Test")
        log = await create_log(db, regular_user.id, wt.id, days_ago=30)

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/worklogs/{log.id}", headers=headers, json={
            "description": "Superadmin eski kaydı düzenledi",
        })
        assert resp.status_code == 200

    async def test_user_cannot_delete_old_log(
        self, client: AsyncClient, regular_user: User, db: AsyncSession
    ):
        wt = await create_work_type(db, "Delete Old Test")
        log = await create_log(db, regular_user.id, wt.id, days_ago=5)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.delete(f"/api/v1/worklogs/{log.id}", headers=headers)
        assert resp.status_code == 403

    async def test_user_cannot_see_other_users_logs(
        self, client: AsyncClient, regular_user: User, superadmin_user: User, db: AsyncSession
    ):
        wt = await create_work_type(db, "Privacy Test")
        log = await create_log(db, superadmin_user.id, wt.id, days_ago=0)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get(f"/api/v1/worklogs/{log.id}", headers=headers)
        assert resp.status_code == 403


class TestWorkLogStats:
    async def test_summary_stats(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        wt = await create_work_type(db, "Stats Test")
        await create_log(db, regular_user.id, wt.id, days_ago=0)
        await create_log(db, regular_user.id, wt.id, days_ago=1)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/worklogs/stats/summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_hours" in data
        assert "by_type" in data
        assert data["total_hours"] >= 4.0


class TestWorkLogListPagination:
    """Regression: the dashboard's 7-day trend widget requests logs without
    an explicit `limit`, relying on the client-side default. If a team logs
    more than the API's default page size within the window, list_logs
    (sorted log_date DESC) silently drops the OLDEST days — the dashboard
    chart then renders those days as zero hours even though data exists."""

    async def test_default_limit_does_not_silently_drop_oldest_days(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        wt = await create_work_type(db, "Bulk Test")
        users = []
        for i in range(20):
            u = User(
                email=f"bulk{i}@test.com",
                username=f"bulk{i}",
                hashed_password=hash_password("Passw0rd!"),
                full_name=f"Bulk User {i}",
                role="user",
                is_active=True,
            )
            db.add(u)
            users.append(u)
        await db.flush()

        # 20 users x 7 days = 140 logs, well past the API's default limit of 100
        for days_ago in range(7):
            for u in users:
                await create_log(db, u.id, wt.id, days_ago=days_ago)

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        date_from = (date.today() - timedelta(days=6)).isoformat()
        date_to = date.today().isoformat()

        # Explicit high limit (what the dashboard now sends) must return every log
        resp = await client.get(
            "/api/v1/worklogs",
            headers=headers,
            params={"date_from": date_from, "date_to": date_to, "limit": 5000},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 140
        assert len(data["items"]) == 140

        hours_by_day: dict[str, float] = {}
        for item in data["items"]:
            hours_by_day[item["log_date"]] = hours_by_day.get(item["log_date"], 0) + item["duration_hours"]

        for days_ago in range(7):
            d = (date.today() - timedelta(days=days_ago)).isoformat()
            assert hours_by_day.get(d) == 40.0, f"day {d} should have 40h (20 users x 2h), got {hours_by_day.get(d)}"
