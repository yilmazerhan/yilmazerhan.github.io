import uuid
import logging
from typing import Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.teams_webhook import TeamsWebhookConfig
from app.core.security import encrypt_field, decrypt_field
from app.config import settings
from app.core.exceptions import NotFoundError

logger = logging.getLogger(__name__)


class TeamsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_webhooks(self) -> list[TeamsWebhookConfig]:
        result = await self.db.execute(select(TeamsWebhookConfig).order_by(TeamsWebhookConfig.created_at))
        return list(result.scalars().all())

    async def get_webhook(self, webhook_id: uuid.UUID) -> TeamsWebhookConfig:
        result = await self.db.execute(select(TeamsWebhookConfig).where(TeamsWebhookConfig.id == webhook_id))
        wh = result.scalar_one_or_none()
        if not wh:
            raise NotFoundError("Teams webhook yapılandırması")
        return wh

    async def create_webhook(
        self,
        name: str,
        webhook_url: str,
        created_by: uuid.UUID,
    ) -> TeamsWebhookConfig:
        wh = TeamsWebhookConfig(
            name=name,
            webhook_url_encrypted=encrypt_field(webhook_url, settings.SMTP_ENCRYPTION_KEY),
            created_by=created_by,
        )
        self.db.add(wh)
        await self.db.flush()
        return wh

    async def update_webhook(
        self,
        webhook_id: uuid.UUID,
        name: Optional[str] = None,
        webhook_url: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> TeamsWebhookConfig:
        wh = await self.get_webhook(webhook_id)
        if name is not None: wh.name = name
        if webhook_url is not None:
            wh.webhook_url_encrypted = encrypt_field(webhook_url, settings.SMTP_ENCRYPTION_KEY)
        if is_active is not None: wh.is_active = is_active
        await self.db.flush()
        return wh

    async def delete_webhook(self, webhook_id: uuid.UUID) -> None:
        wh = await self.get_webhook(webhook_id)
        await self.db.delete(wh)
        await self.db.flush()

    @staticmethod
    def build_adaptive_card(title: str, body: str, action_url: Optional[str] = None) -> dict:
        card: dict = {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "contentUrl": None,
                    "content": {
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "type": "AdaptiveCard",
                        "version": "1.2",
                        "body": [
                            {
                                "type": "TextBlock",
                                "size": "Medium",
                                "weight": "Bolder",
                                "text": title,
                                "wrap": True,
                            },
                            {
                                "type": "TextBlock",
                                "text": body,
                                "wrap": True,
                                "color": "Default",
                            },
                        ],
                    },
                }
            ],
        }
        if action_url:
            card["attachments"][0]["content"]["actions"] = [
                {
                    "type": "Action.OpenUrl",
                    "title": "Görevi Aç",
                    "url": action_url,
                }
            ]
        return card

    async def send_message(
        self,
        webhook_id: uuid.UUID,
        title: str,
        body: str,
        action_url: Optional[str] = None,
    ) -> bool:
        wh = await self.get_webhook(webhook_id)
        if not wh.is_active:
            logger.info("Teams webhook '%s' (%s) is inactive — skipping", wh.name, webhook_id)
            return False
        url = decrypt_field(wh.webhook_url_encrypted, settings.SMTP_ENCRYPTION_KEY)
        payload = self.build_adaptive_card(title, body, action_url)
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(url, json=payload)
            if resp.status_code in (200, 202):
                logger.info("Teams message sent via webhook '%s': %r", wh.name, title)
                return True
            logger.error(
                "Teams webhook '%s' returned HTTP %d — body: %s",
                wh.name, resp.status_code, resp.text[:500],
            )
            return False
        except Exception as exc:
            logger.error("Teams webhook '%s' request failed: %s", wh.name, exc)
            return False

    async def test_webhook(self, webhook_id: uuid.UUID) -> dict:
        try:
            success = await self.send_message(
                webhook_id,
                "Test Mesajı",
                "Bu bir test mesajıdır. Webhook başarıyla yapılandırıldı.",
            )
            return {"success": success, "error": None if success else "Mesaj gönderilemedi — loglara bakın."}
        except Exception as exc:
            logger.error("Teams test_webhook failed for %s: %s", webhook_id, exc)
            return {"success": False, "error": str(exc)}
