import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.email_template import EmailTemplate
from app.tests.conftest import get_auth_headers


async def create_template(db: AsyncSession, name: str = "Test Şablon", slug: str = "test-template") -> EmailTemplate:
    tmpl = EmailTemplate(
        name=name,
        slug=slug,
        subject="Test: {{ title }}",
        html_body="<p>Merhaba {{ name }}</p>",
        is_system=False,
    )
    db.add(tmpl)
    await db.flush()
    return tmpl


async def create_system_template(db: AsyncSession) -> EmailTemplate:
    tmpl = EmailTemplate(
        name="Sistem Şablonu",
        slug="system-template",
        subject="Sistem",
        html_body="<p>Sistem</p>",
        is_system=True,
    )
    db.add(tmpl)
    await db.flush()
    return tmpl


class TestEmailTemplates:
    async def test_list_templates_authenticated(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        await create_template(db)
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/email/templates", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_template_superadmin(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/email/templates", headers=headers, json={
            "name": "Yeni Şablon",
            "slug": "yeni-sablon",
            "subject": "Konu: {{ var }}",
            "html_body": "<p>{{ content }}</p>",
        })
        assert resp.status_code == 201
        assert resp.json()["slug"] == "yeni-sablon"

    async def test_duplicate_slug_rejected(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        await create_template(db, slug="dup-slug")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/email/templates", headers=headers, json={
            "name": "Çakışan",
            "slug": "dup-slug",
            "subject": "Konu",
            "html_body": "<p>body</p>",
        })
        assert resp.status_code == 409

    async def test_cannot_delete_system_template(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl = await create_system_template(db)
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.delete(f"/api/v1/email/templates/{tmpl.id}", headers=headers)
        assert resp.status_code == 422

    async def test_create_template_forbidden_for_user(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/email/templates", headers=headers, json={
            "name": "Yetkisiz", "slug": "yetkisiz", "subject": "s", "html_body": "b",
        })
        assert resp.status_code == 403


class TestEmailWorkflows:
    async def test_create_workflow(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl = await create_template(db, slug="wf-test-1")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/email/workflows", headers=headers, json={
            "name": "Test İş Akışı",
            "trigger_type": "task_due_soon",
            "template_id": str(tmpl.id),
            "recipient_type": "assignee",
            "trigger_config": {"days_before": 3},
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test İş Akışı"
        assert data["is_active"] is True

    async def test_toggle_workflow(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.models.email_workflow import EmailWorkflow
        tmpl = await create_template(db, slug="wf-toggle")
        wf = EmailWorkflow(
            name="Toggle Test",
            trigger_type="task_overdue",
            template_id=tmpl.id,
            recipient_type="assignee",
            is_active=True,
        )
        db.add(wf)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}/toggle", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    async def test_create_workflow_invalid_trigger(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl = await create_template(db, slug="wf-invalid")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/email/workflows", headers=headers, json={
            "name": "Hatalı Tetikleyici",
            "trigger_type": "invalid_type",
            "template_id": str(tmpl.id),
            "recipient_type": "assignee",
        })
        assert resp.status_code == 422


class TestEmailLogs:
    async def test_list_logs_manager(self, client: AsyncClient, manager_user: User, db: AsyncSession):
        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/email/logs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    async def test_list_logs_forbidden_for_user(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/email/logs", headers=headers)
        assert resp.status_code == 403
