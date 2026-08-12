import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.team_task import TeamTask, TeamTaskAssignee
from app.models.user import User
from app.models.user_team import user_teams
from app.core.exceptions import NotFoundError, ValidationError, ForbiddenError

_VALID_STATUSES = ("pending", "in_progress", "done")


class TeamTaskService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_tasks(self, requester: User) -> List[TeamTask]:
        q = (
            select(TeamTask)
            .options(selectinload(TeamTask.assignees), selectinload(TeamTask.creator))
            .order_by(TeamTask.deadline.asc())
        )
        if requester.role == "superadmin":
            pass  # see everything
        elif requester.role == "team_manager":
            # See tasks assigned to members of their teams OR created by themselves
            my_team_ids = select(user_teams.c.team_id).where(user_teams.c.user_id == requester.id)
            team_member_ids = select(user_teams.c.user_id).where(user_teams.c.team_id.in_(my_team_ids))
            q = q.where(
                (TeamTask.created_by == requester.id) |
                TeamTask.id.in_(
                    select(TeamTaskAssignee.team_task_id).where(TeamTaskAssignee.user_id.in_(team_member_ids))
                )
            )
        else:
            # Regular user: only tasks assigned to them
            q = q.where(
                TeamTask.id.in_(
                    select(TeamTaskAssignee.team_task_id).where(TeamTaskAssignee.user_id == requester.id)
                )
            )
        result = await self.db.execute(q)
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

    async def validate_assignee_scope(self, assignee_ids, requester: User) -> None:
        """Reject assignees outside the requester's teams.

        A team_manager could otherwise assign a task to any user in the system,
        injecting work items, in-app notifications and recurring reminder emails
        across tenant boundaries — and because update_task's ACL only requires
        ONE assignee to be in the manager's teams, adding a single own-team
        member to someone else's task granted persistent edit rights over it.
        """
        if requester.role == "superadmin" or not assignee_ids:
            return
        my_team_ids = select(user_teams.c.team_id).where(user_teams.c.user_id == requester.id)
        allowed = set((await self.db.execute(
            select(user_teams.c.user_id).where(user_teams.c.team_id.in_(my_team_ids))
        )).scalars().all())
        allowed.add(requester.id)
        outside = [a for a in assignee_ids if a not in allowed]
        if outside:
            raise ForbiddenError("Yalnızca kendi takımınızdaki kullanıcılara görev atayabilirsiniz.")

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
            # _set_assignees mutates the association table directly, so the
            # already-loaded task.assignees collection is stale. Expire it so
            # the reload below returns the fresh set.
            self.db.expire(task, ["assignees"])

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
        # Diff against existing rows so we preserve completed_at for assignees
        # that stay on the task. A full delete+recreate would wipe completions.
        result = await self.db.execute(
            select(TeamTaskAssignee.user_id).where(TeamTaskAssignee.team_task_id == task_id)
        )
        existing = set(result.scalars().all())
        target = set(assignee_ids)

        to_remove = existing - target
        to_add = target - existing

        if to_remove:
            await self.db.execute(
                delete(TeamTaskAssignee).where(
                    TeamTaskAssignee.team_task_id == task_id,
                    TeamTaskAssignee.user_id.in_(to_remove),
                )
            )
        for user_id in to_add:
            self.db.add(TeamTaskAssignee(team_task_id=task_id, user_id=user_id))

        await self.db.flush()
