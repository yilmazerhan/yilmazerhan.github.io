import uuid
from typing import Optional
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update as sa_update, or_
from sqlalchemy.orm import selectinload

from app.models.kanban import KanbanColumn, Task
from app.models.user import User
from app.core.permissions import can_edit_task, can_delete_task
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError


class KanbanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Columns ─────────────────────────────────────────────────────────────
    async def list_columns(self) -> list[KanbanColumn]:
        result = await self.db.execute(
            select(KanbanColumn).order_by(KanbanColumn.sort_order)
        )
        return list(result.scalars().all())

    async def create_column(self, name: str, color: str, is_terminal: bool, sort_order: int) -> KanbanColumn:
        col = KanbanColumn(name=name, color=color, is_terminal=is_terminal, sort_order=sort_order)
        self.db.add(col)
        await self.db.flush()
        return col

    async def update_column(self, col_id: uuid.UUID, name: Optional[str], color: Optional[str], is_terminal: Optional[bool], sort_order: Optional[int]) -> KanbanColumn:
        result = await self.db.execute(select(KanbanColumn).where(KanbanColumn.id == col_id))
        col = result.scalar_one_or_none()
        if not col:
            raise NotFoundError("Sütun")
        if name is not None:
            col.name = name
        if color is not None:
            col.color = color
        if is_terminal is not None:
            col.is_terminal = is_terminal
        if sort_order is not None:
            col.sort_order = sort_order
        await self.db.flush()
        return col

    async def delete_column(self, col_id: uuid.UUID, requester: User) -> None:
        if requester.role != "superadmin":
            raise ForbiddenError("Sütun silme yalnızca superadmin tarafından yapılabilir.")
        result = await self.db.execute(select(KanbanColumn).where(KanbanColumn.id == col_id))
        col = result.scalar_one_or_none()
        if not col:
            raise NotFoundError("Sütun")
        count = await self.db.execute(
            select(func.count()).where(Task.column_id == col_id, Task.is_archived == False)
        )
        if count.scalar_one() > 0:
            raise ValidationError("Sütunda aktif görevler var. Önce taşıyın veya arşivleyin.")
        await self.db.delete(col)
        await self.db.flush()

    async def reorder_columns(self, orders: list[dict]) -> list[KanbanColumn]:
        for item in orders:
            await self.db.execute(
                sa_update(KanbanColumn)
                .where(KanbanColumn.id == uuid.UUID(item["id"]))
                .values(sort_order=item["sort_order"])
            )
        await self.db.flush()
        return await self.list_columns()

    # ─── Tasks ────────────────────────────────────────────────────────────────
    async def list_tasks(
        self,
        requester: User,
        assignee_id: Optional[uuid.UUID] = None,
        team_id: Optional[uuid.UUID] = None,
        column_id: Optional[uuid.UUID] = None,
        priority: Optional[str] = None,
        due_before: Optional[date] = None,
        include_archived: bool = False,
        skip: int = 0,
        limit: int = 200,
    ) -> tuple[list[Task], int]:
        # Alias for joining users table on assignee
        Assignee = User.__table__.alias("assignee_user")

        q = (
            select(Task)
            .options(selectinload(Task.assignee), selectinload(Task.creator), selectinload(Task.column))
        )

        if not include_archived:
            q = q.where(Task.is_archived == False)

        # ── Role-based scoping ────────────────────────────────────────────────
        if requester.role == "superadmin":
            # Superadmin sees everything; optional team filter
            if team_id:
                q = (
                    q.join(Assignee, Task.assignee_id == Assignee.c.id)
                    .where(Assignee.c.team_id == team_id)
                )
            elif assignee_id:
                q = q.where(Task.assignee_id == assignee_id)
        elif requester.team_id is not None:
            # Team member / manager: scope to own team's tasks
            q = q.outerjoin(Assignee, Task.assignee_id == Assignee.c.id).where(
                or_(
                    Assignee.c.team_id == requester.team_id,
                    Task.assignee_id.is_(None),
                )
            )
            if assignee_id:
                q = q.where(Task.assignee_id == assignee_id)
        else:
            # User without a team: only their own assigned tasks
            q = q.where(Task.assignee_id == requester.id)

        # ── Extra filters ─────────────────────────────────────────────────────
        if column_id:
            q = q.where(Task.column_id == column_id)
        if priority:
            q = q.where(Task.priority == priority)
        if due_before:
            q = q.where(Task.due_date <= due_before)

        total = (await self.db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        q = q.order_by(Task.column_id, Task.sort_order).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def _get_task(self, task_id: uuid.UUID) -> Task:
        result = await self.db.execute(
            select(Task)
            .options(selectinload(Task.assignee), selectinload(Task.creator), selectinload(Task.column))
            .where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            raise NotFoundError("Görev")
        return task

    async def get_task(self, task_id: uuid.UUID, requester: User) -> Task:
        return await self._get_task(task_id)

    async def create_task(
        self,
        title: str,
        column_id: uuid.UUID,
        created_by: uuid.UUID,
        description: Optional[str] = None,
        assignee_id: Optional[uuid.UUID] = None,
        priority: str = "medium",
        due_date: Optional[date] = None,
        jira_ticket: Optional[str] = None,
    ) -> Task:
        col = await self.db.execute(select(KanbanColumn).where(KanbanColumn.id == column_id))
        if not col.scalar_one_or_none():
            raise NotFoundError("Sütun")

        # Max sort_order in column + 1
        max_order = await self.db.execute(
            select(func.max(Task.sort_order)).where(Task.column_id == column_id)
        )
        sort_order = (max_order.scalar_one() or 0) + 1

        task = Task(
            title=title,
            description=description,
            column_id=column_id,
            created_by=created_by,
            assignee_id=assignee_id,
            priority=priority,
            due_date=due_date,
            jira_ticket=jira_ticket,
            sort_order=sort_order,
        )
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task, ["assignee", "creator", "column"])
        return task

    async def update_task(
        self,
        task_id: uuid.UUID,
        requester: User,
        title: Optional[str] = None,
        description: Optional[str] = None,
        assignee_id: object = ...,   # Ellipsis = not sent; None = clear
        priority: Optional[str] = None,
        due_date: object = ...,      # Ellipsis = not sent; None = clear
        jira_ticket: Optional[str] = None,
        is_archived: Optional[bool] = None,
    ) -> Task:
        task = await self._get_task(task_id)
        if not can_edit_task(requester, task):
            raise ForbiddenError("Bu görevi düzenleme yetkiniz yok.")

        if title is not None:
            task.title = title
        if description is not None:
            task.description = description
        if assignee_id is not ...:
            task.assignee_id = assignee_id  # type: ignore[assignment]
        if priority is not None:
            task.priority = priority
        if due_date is not ...:
            task.due_date = due_date  # type: ignore[assignment]
        if jira_ticket is not None:
            task.jira_ticket = jira_ticket.strip() or None
        if is_archived is not None:
            task.is_archived = is_archived

        await self.db.flush()
        await self.db.refresh(task, ["assignee", "creator", "column"])
        return task

    async def move_task(
        self,
        task_id: uuid.UUID,
        column_id: uuid.UUID,
        sort_order: int,
        requester: User,
    ) -> Task:
        task = await self._get_task(task_id)
        if not can_edit_task(requester, task):
            raise ForbiddenError("Bu görevi taşıma yetkiniz yok.")

        col = await self.db.execute(select(KanbanColumn).where(KanbanColumn.id == column_id))
        if not col.scalar_one_or_none():
            raise NotFoundError("Sütun")

        task.column_id = column_id
        task.sort_order = sort_order
        await self.db.flush()
        await self.db.refresh(task, ["assignee", "creator", "column"])
        return task

    async def delete_task(self, task_id: uuid.UUID, requester: User) -> None:
        task = await self._get_task(task_id)
        if not can_delete_task(requester, task):
            raise ForbiddenError("Bu görevi silme yetkiniz yok.")
        task.is_archived = True
        await self.db.flush()
