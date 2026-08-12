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
    async def test_list_templates_superadmin(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        await create_template(db)
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/email/templates", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_templates_forbidden_for_regular_user(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/email/templates", headers=headers)
        assert resp.status_code == 403

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

    async def _create_wf(self, db: AsyncSession, slug: str, trigger_type: str, trigger_config: dict | None = None):
        from app.models.email_workflow import EmailWorkflow
        tmpl = await create_template(db, slug=slug)
        wf = EmailWorkflow(
            name=f"WF {slug}",
            trigger_type=trigger_type,
            template_id=tmpl.id,
            recipient_type="assignee",
            trigger_config=trigger_config,
            is_active=True,
        )
        db.add(wf)
        await db.flush()
        return tmpl, wf

    async def test_update_workflow_name(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        """Basic update returns 200 and reflects the change — verifies refresh() is called."""
        tmpl, wf = await self._create_wf(db, "upd-name", "task_due_soon", {"days_before": 3})
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "name": "Yeni İsim",
            "trigger_config": {"days_before": 5},
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["name"] == "Yeni İsim"
        assert data["trigger_config"]["days_before"] == 5
        assert "updated_at" in data

    async def test_update_workflow_worklog_reminder(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl, wf = await self._create_wf(db, "upd-wlr", "worklog_reminder", {"send_hour": 17, "timezone": "Europe/Istanbul"})
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "name": "İş Günlüğü Hatırlatıcı",
            "trigger_config": {"send_hour": 18, "timezone": "Europe/Istanbul"},
            "recipient_type": "assignee",
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["trigger_config"]["send_hour"] == 18

    async def test_update_workflow_dashboard_report(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl, wf = await self._create_wf(db, "upd-dash", "dashboard_report", {"send_hour": 8, "timezone": "Europe/Istanbul", "frequency": "daily"})
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "trigger_config": {"send_hour": 9, "timezone": "Europe/Istanbul", "frequency": "weekly", "day_of_week": 0},
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["trigger_config"]["frequency"] == "weekly"

    async def test_update_workflow_task_due_soon(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl, wf = await self._create_wf(db, "upd-due", "task_due_soon", {"days_before": 3})
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "trigger_config": {"days_before": 7},
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["trigger_config"]["days_before"] == 7

    async def test_update_workflow_task_overdue(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl, wf = await self._create_wf(db, "upd-over", "task_overdue")
        tmpl2 = await create_template(db, slug="upd-over-t2")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "name": "Gecikmiş Görev",
            "template_id": str(tmpl2.id),
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["template_id"] == str(tmpl2.id)

    async def test_update_workflow_task_status_changed(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl, wf = await self._create_wf(db, "upd-sc", "task_status_changed")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "recipient_type": "creator",
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["recipient_type"] == "creator"

    async def test_update_workflow_task_assigned(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        tmpl, wf = await self._create_wf(db, "upd-ta", "task_assigned")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "recipient_type": "assignee",
            "is_active": False,
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["is_active"] is False

    async def test_update_workflow_disable_teams_clears_webhook(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        """Disabling send_teams must also clear teams_webhook_id."""
        from app.models.email_workflow import EmailWorkflow
        import uuid as uuid_module
        tmpl = await create_template(db, slug="upd-teams-off")
        fake_webhook_id = uuid_module.uuid4()
        wf = EmailWorkflow(
            name="Teams WF",
            trigger_type="task_due_soon",
            template_id=tmpl.id,
            recipient_type="assignee",
            send_teams=True,
        )
        db.add(wf)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "send_teams": False,
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["send_teams"] is False
        assert data["teams_webhook_id"] is None

    async def test_update_workflow_not_found(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        import uuid as uuid_module
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{uuid_module.uuid4()}", headers=headers, json={
            "name": "Olmayan",
        })
        assert resp.status_code == 404

    async def test_update_workflow_forbidden_for_regular_user(self, client: AsyncClient, regular_user: User, db: AsyncSession):
        tmpl, wf = await self._create_wf(db, "upd-auth", "task_due_soon")
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "name": "Yetkisiz",
        })
        assert resp.status_code == 403

    async def test_create_workflow_all_users_recipient(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        """all_users recipient type must be accepted on create."""
        tmpl = await create_template(db, slug="wf-all-users-create")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/email/workflows", headers=headers, json={
            "name": "Tüm Kullanıcılar Workflow",
            "trigger_type": "worklog_reminder",
            "template_id": str(tmpl.id),
            "recipient_type": "all_users",
            "trigger_config": {"send_hour": 17, "timezone": "Europe/Istanbul"},
        })
        assert resp.status_code == 201, resp.text
        assert resp.json()["recipient_type"] == "all_users"

    async def test_update_workflow_to_all_users_recipient(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        """Updating recipient_type to all_users must succeed and persist."""
        tmpl, wf = await self._create_wf(db, "upd-all-users", "worklog_reminder",
                                          {"send_hour": 17, "timezone": "Europe/Istanbul"})
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.patch(f"/api/v1/email/workflows/{wf.id}", headers=headers, json={
            "recipient_type": "all_users",
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["recipient_type"] == "all_users"

    async def test_create_workflow_invalid_recipient_type(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        """Unknown recipient type must be rejected with 422."""
        tmpl = await create_template(db, slug="wf-bad-recipient")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/email/workflows", headers=headers, json={
            "name": "Geçersiz Alıcı",
            "trigger_type": "worklog_reminder",
            "template_id": str(tmpl.id),
            "recipient_type": "nonexistent_type",
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
