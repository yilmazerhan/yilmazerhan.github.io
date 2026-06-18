import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.team_task import TeamTask, TeamTaskAssignee
from app.core.exceptions import NotFoundError, ValidationError

_VALID_STATUSES = ("pending", "in_progress", "done")


class TeamTaskService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_tasks(self) -> List[TeamTask]:
        result = await self.db.execute(
            select(TeamTask)
            .options(selectinload(TeamTask.assignees), selectinload(TeamTask.creator))
            .order_by(TeamTask.deadline.asc())
        )
        return list(result.scalars().all())

    async def get_task(self, task_id: uuid.UUID) -> TeamTask:
        result = await self.db.execute(
            select(TeamTask)
            .options(selectinload(TeamTask.assignees), selectinload(TeamTask.creator))
            .where(TeamTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            raise NotFoundError("Takım görevi")
        return task

    async def create_task(self, data: dict, created_by: uuid.UUID) -> TeamTask:
        assignee_ids = data.pop("assignee_ids", [])
        task = TeamTask(**data, created_by=created_by)
        self.db.add(task)
        await self.db.flush()
        await self._set_assignees(task.id, assignee_ids)
        return await self.get_task(task.id)

    async def update_task(self, task_id: uuid.UUID, data: dict) -> TeamTask:
        task = await self.get_task(task_id)
        assignee_ids = data.pop("assignee_ids", None)

        if "status" in data and data["status"] not in _VALID_STATUSES:
            raise ValidationError(f"Durum şunlardan biri olmalıdır: {', '.join(_VALID_STATUSES)}")

        for key, value in data.items():
            setattr(task, key, value)

        if assignee_ids is not None:
            await self._set_assignees(task.id, assignee_ids)

        await self.db.flush()
        return await self.get_task(task_id)

    async def delete_task(self, task_id: uuid.UUID) -> None:
        task = await self.get_task(task_id)
        await self.db.delete(task)
        await self.db.flush()

    async def toggle_complete(self, task_id: uuid.UUID, user_id: uuid.UUID) -> TeamTask:
        result = await self.db.execute(
            select(TeamTaskAssignee).where(
                TeamTaskAssignee.team_task_id == task_id,
                TeamTaskAssignee.user_id == user_id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise NotFoundError("Bu göreve atanmış değilsiniz")

        record.completed_at = None if record.completed_at is not None else datetime.now(timezone.utc)
        await self.db.flush()
        return await self.get_task(task_id)

    async def _set_assignees(self, task_id: uuid.UUID, assignee_ids: List[uuid.UUID]) -> None:
        await self.db.execute(
            delete(TeamTaskAssignee).where(TeamTaskAssignee.team_task_id == task_id)
        )
        for user_id in assignee_ids:
            self.db.add(TeamTaskAssignee(team_task_id=task_id, user_id=user_id))
        await self.db.flush()
