import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.user import User
from app.models.team import Team
from app.models.kanban import KanbanBoard, KanbanColumn, Task
from app.models.user_team import user_teams
from app.tests.conftest import get_auth_headers


async def create_column(db: AsyncSession, name: str = "Test Sütun", sort_order: int = 1) -> KanbanColumn:
    board = KanbanBoard(name=f"Board for {name}")
    db.add(board)
    await db.flush()
    col = KanbanColumn(name=name, color="#3b82f6", sort_order=sort_order, is_terminal=False, board_id=board.id)
    db.add(col)
    await db.flush()
    return col


async def create_task(
    db: AsyncSession,
    title: str,
    column_id,
    created_by,
    assignee_id=None,
    priority: str = "medium",
) -> Task:
    task = Task(
        title=title,
        column_id=column_id,
        created_by=created_by,
        assignee_id=assignee_id,
        priority=priority,
        sort_order=1,
    )
    db.add(task)
    await db.flush()
    return task


class TestKanbanColumns:
    async def test_list_columns_authenticated(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        await create_column(db, "Bekleyen")
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/kanban/columns", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_column_superadmin(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        # Create a default board so the service can find one when board_id is omitted
        board = KanbanBoard(name="Default Board")
        db.add(board)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/kanban/columns", headers=headers, json={
            "name": "Yeni Sütun",
            "color": "#6366f1",
            "is_terminal": False,
            "sort_order": 99,
        })
        assert resp.status_code == 201
        assert resp.json()["name"] == "Yeni Sütun"

    async def test_create_column_forbidden_for_user(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/kanban/columns", headers=headers, json={
            "name": "Yetkisiz",
            "color": "#000000",
            "sort_order": 1,
        })
        assert resp.status_code == 403

    async def test_delete_column_with_active_tasks_rejected(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        col = await create_column(db, "Silinecek Sütun", sort_order=50)
        await create_task(db, "Aktif Görev", col.id, superadmin_user.id)

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.delete(f"/api/v1/kanban/columns/{col.id}", headers=headers)
        assert resp.status_code == 422

    async def test_reorder_columns(
        self, client: AsyncClient, manager_user: User, db: AsyncSession
    ):
        col1 = await create_column(db, "Sütun A", sort_order=10)
        col2 = await create_column(db, "Sütun B", sort_order=20)

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.put("/api/v1/kanban/columns/reorder", headers=headers, json=[
            {"id": str(col1.id), "sort_order": 20},
            {"id": str(col2.id), "sort_order": 10},
        ])
        assert resp.status_code == 200


class TestKanbanTasks:
    async def test_create_task(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        col = await create_column(db, "Todo", sort_order=1)
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/kanban/tasks", headers=headers, json={
            "title": "Yeni Görev",
            "column_id": str(col.id),
            "priority": "high",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Yeni Görev"
        assert data["created_by"] == str(regular_user.id)

    async def test_create_task_invalid_column(self, client: AsyncClient, regular_user: User):
        import uuid
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/kanban/tasks", headers=headers, json={
            "title": "Geçersiz Sütun",
            "column_id": str(uuid.uuid4()),
        })
        assert resp.status_code == 404

    async def test_list_tasks(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        col = await create_column(db, "InProgress", sort_order=2)
        # Set assignee_id so regular user can see their assigned tasks
        await create_task(db, "Görev 1", col.id, regular_user.id, assignee_id=regular_user.id)
        await create_task(db, "Görev 2", col.id, regular_user.id, assignee_id=regular_user.id)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/kanban/tasks", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 2

    async def test_move_task(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        col1 = await create_column(db, "Kaynaktan", sort_order=3)
        col2 = await create_column(db, "Hedefe", sort_order=4)
        task = await create_task(db, "Taşınacak Görev", col1.id, regular_user.id)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.patch(f"/api/v1/kanban/tasks/{task.id}/move", headers=headers, json={
            "column_id": str(col2.id),
            "sort_order": 1,
        })
        assert resp.status_code == 200
        assert resp.json()["column_id"] == str(col2.id)

    async def test_creator_can_edit_own_task(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        col = await create_column(db, "Düzenlenecek", sort_order=5)
        task = await create_task(db, "Eski Başlık", col.id, regular_user.id)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.patch(f"/api/v1/kanban/tasks/{task.id}", headers=headers, json={
            "title": "Güncellenmiş Başlık",
        })
        assert resp.status_code == 200
        assert resp.json()["title"] == "Güncellenmiş Başlık"

    async def test_other_user_cannot_edit_task(
        self, client: AsyncClient, regular_user: User, manager_user: User, db: AsyncSession
    ):
        col = await create_column(db, "Yetki Testi", sort_order=6)
        # manager creates a task
        task = await create_task(db, "Yöneticinin Görevi", col.id, manager_user.id)

        # regular_user tries to edit
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.patch(f"/api/v1/kanban/tasks/{task.id}", headers=headers, json={
            "title": "Başkası Güncelledi",
        })
        assert resp.status_code == 403

    async def test_assignee_can_edit_task(
        self, client: AsyncClient, regular_user: User, superadmin_user: User, db: AsyncSession
    ):
        col = await create_column(db, "Atanan Görevi", sort_order=7)
        task = await create_task(
            db, "Atanmış Görev", col.id,
            created_by=superadmin_user.id,
            assignee_id=regular_user.id,
        )

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.patch(f"/api/v1/kanban/tasks/{task.id}", headers=headers, json={
            "priority": "high",
        })
        assert resp.status_code == 200

    async def test_superadmin_can_edit_any_task(
        self, client: AsyncClient, superadmin_user: User, regular_user: User, db: AsyncSession
    ):
        col = await create_column(db, "SA Düzenle", sort_order=8)
        task = await create_task(db, "Kullanıcı Görevi", col.id, regular_user.id)

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/kanban/tasks/{task.id}", headers=headers, json={
            "title": "SA Güncelledi",
        })
        assert resp.status_code == 200

    async def test_delete_task_archives_it(
        self, client: AsyncClient, regular_user: User, db: AsyncSession
    ):
        col = await create_column(db, "Arşivlenecek", sort_order=9)
        task = await create_task(db, "Silinecek Görev", col.id, regular_user.id)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.delete(f"/api/v1/kanban/tasks/{task.id}", headers=headers)
        assert resp.status_code == 200

        # Task should not appear in active list
        resp2 = await client.get("/api/v1/kanban/tasks", headers=headers)
        ids = [t["id"] for t in resp2.json()["items"]]
        assert str(task.id) not in ids

    async def test_manager_can_edit_team_member_task(
        self, client: AsyncClient, manager_user: User, regular_user: User, db: AsyncSession
    ):
        team = Team(name="Kanban Takımı", manager_id=manager_user.id)
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

        col = await create_column(db, "Takım Görevi", sort_order=10)
        # Task must be assigned to the team member so manager can see/edit it
        task = await create_task(db, "Üyenin Görevi", col.id, regular_user.id, assignee_id=regular_user.id)

        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.patch(f"/api/v1/kanban/tasks/{task.id}", headers=headers, json={
            "priority": "critical",
        })
        assert resp.status_code == 200

    async def test_filter_tasks_by_column(
        self, client: AsyncClient, regular_user: User, db: AsyncSession
    ):
        col = await create_column(db, "Filtre Sütunu", sort_order=11)
        await create_task(db, "Filtre Görevi", col.id, regular_user.id)

        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get(f"/api/v1/kanban/tasks?column_id={col.id}", headers=headers)
        assert resp.status_code == 200
        for task in resp.json()["items"]:
            assert task["column_id"] == str(col.id)
