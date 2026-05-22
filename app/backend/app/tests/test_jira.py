import pytest
import respx
import httpx
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.jira_config import JiraConfig
from app.models.kanban import KanbanColumn, Task
from app.core.security import encrypt_field
from app.config import settings
from app.tests.conftest import get_auth_headers


async def create_jira_config(db: AsyncSession, superadmin_id, active: bool = True) -> JiraConfig:
    token = encrypt_field("test_api_token", settings.JIRA_ENCRYPTION_KEY)
    cfg = JiraConfig(
        name="Test Jira",
        base_url="https://test.atlassian.net",
        email="test@example.com",
        api_token_encrypted=token,
        project_key="TEST",
        is_active=active,
        created_by=superadmin_id,
    )
    db.add(cfg)
    await db.flush()
    return cfg


async def create_task_with_jira(db: AsyncSession, user_id, jira_ticket: str = "TEST-1") -> Task:
    col = KanbanColumn(name="Jira Test Sütun", color="#000000", sort_order=99, is_terminal=False)
    db.add(col)
    await db.flush()
    task = Task(
        title="Jira Test Görevi",
        column_id=col.id,
        created_by=user_id,
        jira_ticket=jira_ticket,
        sort_order=1,
    )
    db.add(task)
    await db.flush()
    return task


class TestJiraConfigCRUD:
    async def test_create_config_superadmin(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/jira/configs", headers=headers, json={
            "name": "Test Jira",
            "base_url": "https://myco.atlassian.net",
            "email": "admin@myco.com",
            "api_token": "secret_token",
            "project_key": "MYCO",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Jira"
        assert "api_token" not in data  # token should not be exposed

    async def test_create_config_forbidden_for_user(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/jira/configs", headers=headers, json={
            "name": "Yetkisiz",
            "base_url": "https://x.atlassian.net",
            "email": "x@x.com",
            "api_token": "tok",
            "project_key": "X",
        })
        assert resp.status_code == 403

    async def test_list_configs(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        await create_jira_config(db, superadmin_user.id)
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/jira/configs", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_update_config(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        cfg = await create_jira_config(db, superadmin_user.id)
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/jira/configs/{cfg.id}", headers=headers, json={
            "name": "Güncellenmiş Jira"
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Güncellenmiş Jira"

    async def test_delete_config(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        cfg = await create_jira_config(db, superadmin_user.id)
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.delete(f"/api/v1/jira/configs/{cfg.id}", headers=headers)
        assert resp.status_code == 200


class TestJiraConnection:
    @respx.mock
    async def test_connection_success(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        cfg = await create_jira_config(db, superadmin_user.id)
        respx.get(f"https://test.atlassian.net/rest/api/3/project/TEST").mock(
            return_value=httpx.Response(200, json={"name": "Test Project"})
        )
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post(f"/api/v1/jira/configs/{cfg.id}/test", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert resp.json()["project_name"] == "Test Project"

    @respx.mock
    async def test_connection_failure(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        cfg = await create_jira_config(db, superadmin_user.id)
        respx.get(f"https://test.atlassian.net/rest/api/3/project/TEST").mock(
            return_value=httpx.Response(401, text="Unauthorized")
        )
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post(f"/api/v1/jira/configs/{cfg.id}/test", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is False


class TestJiraStatusRefresh:
    @respx.mock
    async def test_refresh_task_jira_status(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        await create_jira_config(db, superadmin_user.id, active=True)
        task = await create_task_with_jira(db, superadmin_user.id, "TEST-42")

        respx.get("https://test.atlassian.net/rest/api/3/issue/TEST-42").mock(
            return_value=httpx.Response(200, json={
                "fields": {"status": {"name": "In Progress"}}
            })
        )

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post(f"/api/v1/jira/tasks/{task.id}/refresh-jira", headers=headers)
        assert resp.status_code == 200

    async def test_refresh_task_without_jira_ticket(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        col = KanbanColumn(name="No Jira Col", color="#ccc", sort_order=100, is_terminal=False)
        db.add(col)
        await db.flush()
        task = Task(title="Jira Yok", column_id=col.id, created_by=superadmin_user.id, sort_order=1)
        db.add(task)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post(f"/api/v1/jira/tasks/{task.id}/refresh-jira", headers=headers)
        assert resp.status_code == 422
