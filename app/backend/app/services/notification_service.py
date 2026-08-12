import re
import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update as sa_update, func

from app.models.notification import Notification
from app.models.user import User


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        user_id: uuid.UUID,
        type: str,
        title: str,
        body: Optional[str] = None,
        link: Optional[str] = None,
    ) -> Notification:
        n = Notification(user_id=user_id, type=type, title=title, body=body, link=link)
        self.db.add(n)
        await self.db.flush()
        return n

    async def list_for_user(self, user_id: uuid.UUID, limit: int = 50) -> list[Notification]:
        result = await self.db.execute(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def unread_count(self, user_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).where(
                Notification.user_id == user_id,
                Notification.is_read == False,
            )
        )
        return result.scalar_one()

    async def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> None:
        await self.db.execute(
            sa_update(Notification)
            .where(Notification.id == notification_id, Notification.user_id == user_id)
            .values(is_read=True)
        )
        await self.db.flush()

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        await self.db.execute(
            sa_update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read == False)
            .values(is_read=True)
        )
        await self.db.flush()

    async def notify_mentions(
        self,
        content: str,
        task_title: str,
        actor_id: uuid.UUID,
    ) -> None:
        usernames = re.findall(r'@([A-Za-z0-9_.]+)', content)
        if not usernames:
            return
        result = await self.db.execute(
            select(User).where(User.username.in_(usernames), User.is_active == True)
        )
        for u in result.scalars().all():
            if u.id != actor_id:
                await self.create(
                    user_id=u.id,
                    type='mention',
                    title=f'Yorumda bahsedildiniz',
                    body=f'Görev: "{task_title}"',
                    link='/kanban',
                )
