import uuid
import base64
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.jira_config import JiraConfig
from app.models.kanban import Task
from app.core.security import encrypt_field, decrypt_field
from app.config import settings
from app.core.exceptions import NotFoundError, ForbiddenError, ServiceUnavailableError, ValidationError


JIRA_CACHE_TTL_MINUTES = 30


class JiraService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Config CRUD ──────────────────────────────────────────────────────────

    async def list_configs(self) -> list[JiraConfig]:
        result = await self.db.execute(select(JiraConfig).order_by(JiraConfig.created_at))
        return list(result.scalars().all())

    async def get_config(self, config_id: uuid.UUID) -> JiraConfig:
        result = await self.db.execute(select(JiraConfig).where(JiraConfig.id == config_id))
        cfg = result.scalar_one_or_none()
        if not cfg:
            raise NotFoundError("Jira yapılandırması")
        return cfg

    async def create_config(
        self,
        name: str,
        base_url: str,
        email: str,
        api_token: str,
        project_key: str,
        created_by: uuid.UUID,
    ) -> JiraConfig:
        encrypted_token = encrypt_field(api_token, settings.JIRA_ENCRYPTION_KEY)
        cfg = JiraConfig(
            name=name,
            base_url=base_url.rstrip("/"),
            email=email,
            api_token_encrypted=encrypted_token,
            project_key=project_key,
            created_by=created_by,
        )
        self.db.add(cfg)
        await self.db.flush()
        return cfg

    async def update_config(
        self,
        config_id: uuid.UUID,
        name: Optional[str] = None,
        base_url: Optional[str] = None,
        email: Optional[str] = None,
        api_token: Optional[str] = None,
        project_key: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> JiraConfig:
        cfg = await self.get_config(config_id)
        if name is not None:
            cfg.name = name
        if base_url is not None:
            cfg.base_url = base_url.rstrip("/")
        if email is not None:
            cfg.email = email
        if api_token is not None:
            cfg.api_token_encrypted = encrypt_field(api_token, settings.JIRA_ENCRYPTION_KEY)
        if project_key is not None:
            cfg.project_key = project_key
        if is_active is not None:
            cfg.is_active = is_active
        await self.db.flush()
        return cfg

    async def delete_config(self, config_id: uuid.UUID) -> None:
        cfg = await self.get_config(config_id)
        await self.db.delete(cfg)
        await self.db.flush()

    # ─── Connection test ──────────────────────────────────────────────────────

    async def test_connection(self, config_id: uuid.UUID) -> dict:
        cfg = await self.get_config(config_id)
        api_token = decrypt_field(cfg.api_token_encrypted, settings.JIRA_ENCRYPTION_KEY)
        auth = base64.b64encode(f"{cfg.email}:{api_token}".encode()).decode()
        url = f"{cfg.base_url}/rest/api/3/project/{cfg.project_key}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers={"Authorization": f"Basic {auth}"})
            if resp.status_code == 200:
                data = resp.json()
                return {"success": True, "project_name": data.get("name", cfg.project_key)}
            return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        except httpx.TimeoutException:
            return {"success": False, "error": "Bağlantı zaman aşımına uğradı."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ─── Jira status fetch ─────────────────────────────────────────────────────

    async def _get_active_config(self) -> Optional[JiraConfig]:
        result = await self.db.execute(
            select(JiraConfig).where(JiraConfig.is_active == True).limit(1)
        )
        return result.scalar_one_or_none()

    async def fetch_ticket_status(self, jira_ticket: str) -> Optional[str]:
        cfg = await self._get_active_config()
        if not cfg:
            return None
        api_token = decrypt_field(cfg.api_token_encrypted, settings.JIRA_ENCRYPTION_KEY)
        auth = base64.b64encode(f"{cfg.email}:{api_token}".encode()).decode()
        url = f"{cfg.base_url}/rest/api/3/issue/{jira_ticket}?fields=status"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(url, headers={"Authorization": f"Basic {auth}"})
            if resp.status_code == 200:
                return resp.json()["fields"]["status"]["name"]
        except Exception:
            pass
        return None

    async def refresh_task_jira_status(self, task_id: uuid.UUID) -> Task:
        result = await self.db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise NotFoundError("Görev")
        if not task.jira_ticket:
            raise ValidationError("Bu görevin Jira ticket numarası yok.")

        status = await self.fetch_ticket_status(task.jira_ticket)
        task.jira_status = status
        task.jira_status_updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return task

    async def bulk_refresh_jira_statuses(self) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=JIRA_CACHE_TTL_MINUTES)
        result = await self.db.execute(
            select(Task).where(
                Task.jira_ticket.isnot(None),
                Task.is_archived == False,
            )
        )
        tasks = result.scalars().all()
        stale = [
            t for t in tasks
            if t.jira_status_updated_at is None or t.jira_status_updated_at < cutoff
        ]
        updated = 0
        for task in stale:
            status = await self.fetch_ticket_status(task.jira_ticket)
            if status is not None:
                task.jira_status = status
                task.jira_status_updated_at = datetime.now(timezone.utc)
                updated += 1
        if updated:
            await self.db.flush()
        return updated
