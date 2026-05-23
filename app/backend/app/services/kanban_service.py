import uuid
from typing import Optional
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update as sa_update, or_
from sqlalchemy.orm import selectinload

from app.models.kanban import KanbanColumn, Task
from app.models.task_comment import TaskComment
from app.models.task_history import TaskHistory
from app.models.user import User
from app.core.permissions import can_edit_task, can_delete_task
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
from app.services.notification_service import NotificationService


class KanbanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _write_history(
        self,
        task_id: uuid.UUID,
        actor_id: Optional[uuid.UUID],
        action: str,
        changes: Optional[list[dict]] = None,
    ) -> None:
        entry = TaskHistory(
            task_id=task_id,
            changed_by=actor_id,
            action=action,
            changes=changes,
        )
        self.db.add(entry)

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
        await self.db.refresh(task, ["created_at", "updated_at", "assignee", "creator", "column"])
        await self._write_history(task.id, created_by, "created")
        # Notify assigned user
        if assignee_id and assignee_id != created_by:
            nsvc = NotificationService(self.db)
            await nsvc.create(
                user_id=assignee_id,
                type='task_assigned',
                title='Size bir görev atandı',
                body=f'"{title}"',
                link='/kanban',
            )
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

        changes: list[dict] = []

        if title is not None and title != task.title:
            changes.append({"field": "title", "old": task.title, "new": title})
            task.title = title
        if description is not None and description != task.description:
            old_desc = (task.description or "")[:120] or None
            new_desc = description[:120] or None
            changes.append({"field": "description", "old": old_desc, "new": new_desc})
            task.description = description
        if assignee_id is not ...:
            old_id = str(task.assignee_id) if task.assignee_id else None
            new_id = str(assignee_id) if assignee_id else None
            if old_id != new_id:
                old_name = task.assignee.full_name if task.assignee else None
                changes.append({"field": "assignee", "old": old_name, "new": new_id})
            task.assignee_id = assignee_id  # type: ignore[assignment]
        if priority is not None and priority != task.priority:
            changes.append({"field": "priority", "old": task.priority, "new": priority})
            task.priority = priority
        if due_date is not ...:
            old_due = task.due_date.isoformat() if task.due_date else None
            new_due = due_date.isoformat() if due_date else None  # type: ignore[union-attr]
            if old_due != new_due:
                changes.append({"field": "due_date", "old": old_due, "new": new_due})
            task.due_date = due_date  # type: ignore[assignment]
        if jira_ticket is not None:
            new_jira = jira_ticket.strip() or None
            if new_jira != task.jira_ticket:
                changes.append({"field": "jira_ticket", "old": task.jira_ticket, "new": new_jira})
            task.jira_ticket = new_jira
        if is_archived is not None and is_archived != task.is_archived:
            changes.append({"field": "archived", "old": str(task.is_archived), "new": str(is_archived)})
            task.is_archived = is_archived

        await self.db.flush()
        await self.db.refresh(task, ["updated_at", "assignee", "creator", "column"])

        if changes:
            # Resolve assignee name for display now that relationships are loaded
            for ch in changes:
                if ch["field"] == "assignee" and ch["new"] is not None:
                    ch["new"] = task.assignee.full_name if task.assignee else ch["new"]
            await self._write_history(task.id, requester.id, "updated", changes)

        # Notify new assignee if changed
        if assignee_id is not ... and assignee_id is not None and assignee_id != requester.id:
            for ch in changes:
                if ch["field"] == "assignee":
                    nsvc = NotificationService(self.db)
                    await nsvc.create(
                        user_id=assignee_id,
                        type='task_assigned',
                        title='Size bir görev atandı',
                        body=f'"{task.title}"',
                        link='/kanban',
                    )
                    break

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

        old_col_name = task.column.name if task.column else str(task.column_id)
        task.column_id = column_id
        task.sort_order = sort_order
        await self.db.flush()
        await self.db.refresh(task, ["updated_at", "assignee", "creator", "column"])
        new_col_name = task.column.name if task.column else str(column_id)
        if str(old_col_name) != str(new_col_name):
            await self._write_history(
                task.id, requester.id, "moved",
                [{"field": "column", "old": old_col_name, "new": new_col_name}],
            )
        return task

    async def delete_task(self, task_id: uuid.UUID, requester: User) -> None:
        task = await self._get_task(task_id)
        if not can_delete_task(requester, task):
            raise ForbiddenError("Bu görevi silme yetkiniz yok.")
        task.is_archived = True
        await self._write_history(task.id, requester.id, "archived")
        await self.db.flush()

    # ─── Comments ─────────────────────────────────────────────────────────────
    async def list_comments(self, task_id: uuid.UUID) -> list[TaskComment]:
        result = await self.db.execute(
            select(TaskComment)
            .options(selectinload(TaskComment.author))
            .where(TaskComment.task_id == task_id)
            .order_by(TaskComment.created_at)
        )
        return list(result.scalars().all())

    async def create_comment(self, task_id: uuid.UUID, user_id: uuid.UUID, content: str) -> TaskComment:
        task_exists = await self.db.execute(select(Task.id).where(Task.id == task_id))
        if not task_exists.scalar_one_or_none():
            raise NotFoundError("Görev")
        comment = TaskComment(task_id=task_id, user_id=user_id, content=content)
        self.db.add(comment)
        await self.db.flush()
        await self.db.refresh(comment, ["created_at", "updated_at", "author"])
        await self._write_history(
            task_id, user_id, "comment_added",
            [{"field": "comment", "old": None, "new": content[:120]}],
        )
        # Notify task assignee and creator about new comment (not self)
        task_full = await self._get_task(task_id)
        nsvc = NotificationService(self.db)
        notified: set[uuid.UUID] = {user_id}
        for notify_uid in [task_full.assignee_id, task_full.created_by]:
            if notify_uid and notify_uid not in notified:
                notified.add(notify_uid)
                await nsvc.create(
                    user_id=notify_uid,
                    type='comment_added',
                    title='Görevinize yorum eklendi',
                    body=f'"{task_full.title}": {content[:80]}',
                    link='/kanban',
                )
        # Notify @mentions
        await nsvc.notify_mentions(content, task_full.title, user_id)
        return comment

    async def delete_comment(self, comment_id: uuid.UUID, requester: User) -> None:
        result = await self.db.execute(
            select(TaskComment).where(TaskComment.id == comment_id)
        )
        comment = result.scalar_one_or_none()
        if not comment:
            raise NotFoundError("Yorum")
        if requester.role != "superadmin" and comment.user_id != requester.id:
            raise ForbiddenError("Bu yorumu silme yetkiniz yok.")
        task_id = comment.task_id
        await self.db.delete(comment)
        await self._write_history(task_id, requester.id, "comment_deleted")
        await self.db.flush()

    async def list_history(self, task_id: uuid.UUID) -> list[TaskHistory]:
        result = await self.db.execute(
            select(TaskHistory)
            .options(selectinload(TaskHistory.actor))
            .where(TaskHistory.task_id == task_id)
            .order_by(TaskHistory.created_at.desc())
        )
        return list(result.scalars().all())
