import uuid
from typing import Optional
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update as sa_update, or_, exists
from sqlalchemy.orm import selectinload
from app.models.user_team import user_teams

from app.models.kanban import KanbanBoard, KanbanColumn, Task
from app.models.task_comment import TaskComment
from app.models.task_history import TaskHistory
from app.models.task_subtask import TaskSubtask
from app.models.task_label import TaskLabel
from app.models.user import User
from app.core.permissions import can_edit_task, can_delete_task
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
from app.services.notification_service import NotificationService
from app.schemas.kanban import SubtaskCreate, SubtaskUpdate


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

    # ─── Boards ──────────────────────────────────────────────────────────────

    async def _requester_manages_user(self, requester_id: uuid.UUID, target_user_id: uuid.UUID) -> bool:
        """Return True if requester is a team_manager of any team the target user belongs to."""
        result = await self.db.execute(
            select(func.count()).where(
                exists(
                    select(1)
                    .where(
                        user_teams.c.user_id == requester_id,
                        user_teams.c.team_id.in_(
                            select(user_teams.c.team_id).where(user_teams.c.user_id == target_user_id)
                        ),
                    )
                )
            )
        )
        return result.scalar_one() > 0

    async def _can_see_board(self, board: KanbanBoard, requester: User) -> bool:
        """Check if requester can see the given board."""
        if not board.is_personal:
            return True  # All regular boards are visible to everyone
        # Personal board: only owner, their team managers, and superadmin
        if requester.role == "superadmin":
            return True
        if board.created_by == requester.id:
            return True
        if requester.role == "team_manager" and board.created_by:
            return await self._requester_manages_user(requester.id, board.created_by)
        return False

    async def _can_manage_board(self, board: KanbanBoard, requester: User) -> bool:
        """Check if requester can edit/delete the given board."""
        if requester.role == "superadmin":
            return True
        if board.created_by == requester.id:
            return True
        if requester.role == "team_manager" and board.created_by:
            return await self._requester_manages_user(requester.id, board.created_by)
        return False

    async def list_boards(
        self,
        requester: User,
        include_archived: bool = False,
        personal_owner_id: Optional[uuid.UUID] = None,
    ) -> list[dict]:
        q = select(KanbanBoard)
        if not include_archived:
            q = q.where(KanbanBoard.is_archived == False)
        q = q.order_by(KanbanBoard.is_personal.desc(), KanbanBoard.created_at)
        result = await self.db.execute(q)
        boards = list(result.scalars().all())

        board_list = []
        for board in boards:
            if board.is_personal:
                # Personal boards: only show your own unless personal_owner_id is given
                if board.created_by == requester.id:
                    pass  # always show own personal board
                elif personal_owner_id and board.created_by == personal_owner_id:
                    # Managers/superadmin explicitly requested another user's board
                    if requester.role == "superadmin":
                        pass  # allowed
                    elif requester.role == "team_manager" and board.created_by:
                        if not await self._requester_manages_user(requester.id, board.created_by):
                            continue  # manager doesn't manage this user
                    else:
                        continue  # regular user can't see others' personal boards
                else:
                    continue  # skip other users' personal boards
            else:
                pass  # shared boards always visible
            col_count = (
                await self.db.execute(
                    select(func.count()).where(KanbanColumn.board_id == board.id)
                )
            ).scalar_one()
            task_count = (
                await self.db.execute(
                    select(func.count())
                    .select_from(Task)
                    .join(KanbanColumn, Task.column_id == KanbanColumn.id)
                    .where(KanbanColumn.board_id == board.id, Task.is_archived == False)
                )
            ).scalar_one()
            board_list.append({
                "id": board.id,
                "name": board.name,
                "description": board.description,
                "color": board.color,
                "is_archived": board.is_archived,
                "is_personal": board.is_personal,
                "created_by": board.created_by,
                "created_at": board.created_at,
                "updated_at": board.updated_at,
                "column_count": col_count,
                "task_count": task_count,
            })
        return board_list

    async def get_board(self, board_id: uuid.UUID) -> KanbanBoard:
        result = await self.db.execute(
            select(KanbanBoard).where(KanbanBoard.id == board_id)
        )
        board = result.scalar_one_or_none()
        if not board:
            raise NotFoundError("Pano")
        return board

    async def create_board(
        self,
        name: str,
        description: Optional[str],
        color: str,
        created_by: uuid.UUID,
        is_personal: bool = False,
    ) -> KanbanBoard:
        if is_personal:
            # Enforce one personal board per user
            existing = (await self.db.execute(
                select(func.count()).where(
                    KanbanBoard.is_personal == True,
                    KanbanBoard.created_by == created_by,
                )
            )).scalar_one()
            if existing > 0:
                raise ValidationError("Zaten bir kişisel panonuz var.")

        board = KanbanBoard(name=name, description=description, color=color, created_by=created_by, is_personal=is_personal)
        self.db.add(board)
        await self.db.flush()

        default_cols = [
            KanbanColumn(board_id=board.id, name="Bekleyen", name_key="kanban.col_pending", color="#e2e8f0", sort_order=0),
            KanbanColumn(board_id=board.id, name="Devam Eden", name_key="kanban.col_in_progress", color="#fef3c7", sort_order=1),
            KanbanColumn(board_id=board.id, name="İncelemede", name_key="kanban.col_in_review", color="#dbeafe", sort_order=2),
            KanbanColumn(board_id=board.id, name="Tamamlandı", name_key="kanban.col_done", color="#d1fae5", is_terminal=True, sort_order=3),
        ]
        for col in default_cols:
            self.db.add(col)
        await self.db.flush()
        return board

    async def update_board(self, board_id: uuid.UUID, requester: User, name: Optional[str], description: Optional[str], color: Optional[str], is_archived: Optional[bool]) -> KanbanBoard:
        board = await self.get_board(board_id)
        if not await self._can_manage_board(board, requester):
            raise ForbiddenError("Bu panoyu düzenleme yetkiniz yok.")
        if board.is_personal and is_archived:
            raise ValidationError("Kişisel pano arşivlenemez.")
        if name is not None:
            board.name = name
        if description is not None:
            board.description = description
        if color is not None:
            board.color = color
        if is_archived is not None:
            board.is_archived = is_archived
        await self.db.flush()
        return board

    async def delete_board(self, board_id: uuid.UUID, requester: User) -> None:
        board = await self.get_board(board_id)

        # Personal boards cannot be deleted
        if board.is_personal:
            raise ValidationError("Kişisel pano silinemez.")

        # Permission: creator, team_manager of creator, or superadmin
        if not await self._can_manage_board(board, requester):
            raise ForbiddenError("Bu panoyu silme yetkiniz yok. Yalnızca pano oluşturan, takım yöneticisi veya süper admin silebilir.")

        await self.db.delete(board)
        await self.db.flush()

    # ─── Columns ─────────────────────────────────────────────────────────────
    async def list_columns(self, board_id: Optional[uuid.UUID] = None) -> list[KanbanColumn]:
        q = select(KanbanColumn)
        if board_id is not None:
            q = q.where(KanbanColumn.board_id == board_id)
        q = q.order_by(KanbanColumn.sort_order)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def create_column(self, name: str, color: str, is_terminal: bool, sort_order: int, board_id: Optional[uuid.UUID] = None) -> KanbanColumn:
        # If no board_id, use the first (default) board
        if board_id is None:
            result = await self.db.execute(
                select(KanbanBoard).order_by(KanbanBoard.created_at).limit(1)
            )
            default_board = result.scalar_one_or_none()
            if not default_board:
                raise ValidationError("Pano bulunamadı.")
            board_id = default_board.id
        col = KanbanColumn(name=name, color=color, is_terminal=is_terminal, sort_order=sort_order, board_id=board_id)
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

    # ─── Labels ──────────────────────────────────────────────────────────────
    async def list_labels(self) -> list[TaskLabel]:
        result = await self.db.execute(select(TaskLabel).order_by(TaskLabel.name))
        return list(result.scalars().all())

    async def create_label(self, name: str, color: str, created_by: uuid.UUID) -> TaskLabel:
        label = TaskLabel(name=name, color=color, created_by=created_by)
        self.db.add(label)
        await self.db.flush()
        await self.db.refresh(label)
        return label

    async def update_label(self, label_id: uuid.UUID, name: Optional[str], color: Optional[str]) -> TaskLabel:
        result = await self.db.execute(select(TaskLabel).where(TaskLabel.id == label_id))
        label = result.scalar_one_or_none()
        if not label:
            raise NotFoundError("Etiket")
        if name is not None:
            label.name = name
        if color is not None:
            label.color = color
        await self.db.flush()
        await self.db.refresh(label)
        return label

    async def delete_label(self, label_id: uuid.UUID) -> None:
        result = await self.db.execute(select(TaskLabel).where(TaskLabel.id == label_id))
        label = result.scalar_one_or_none()
        if not label:
            raise NotFoundError("Etiket")
        await self.db.delete(label)
        await self.db.flush()

    # ─── Tasks ────────────────────────────────────────────────────────────────
    async def list_tasks(
        self,
        requester: User,
        assignee_id: Optional[uuid.UUID] = None,
        team_id: Optional[uuid.UUID] = None,
        column_id: Optional[uuid.UUID] = None,
        board_id: Optional[uuid.UUID] = None,
        priority: Optional[str] = None,
        due_before: Optional[date] = None,
        include_archived: bool = False,
        search: Optional[str] = None,
        label_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 200,
    ) -> tuple[list[Task], int]:
        from app.models.user_team import user_teams

        q = (
            select(Task)
            .options(
                selectinload(Task.assignee),
                selectinload(Task.creator),
                selectinload(Task.column),
                selectinload(Task.labels),
            )
        )

        if not include_archived:
            q = q.where(Task.is_archived == False)

        # ── Board-aware visibility ────────────────────────────────────────────
        # When listing a specific board, the board itself governs visibility:
        # shared boards expose all tasks to every user; personal boards are
        # restricted to their owner, the owner's team managers, and superadmin.
        board = None
        if board_id:
            board = await self.get_board(board_id)
            if board.is_personal and not await self._can_see_board(board, requester):
                raise ForbiddenError("Bu panoya erişim izniniz yok.")

        # ── Role-based scoping ────────────────────────────────────────────────
        if board is not None:
            # Board-scoped listing: visibility already resolved above.
            # Apply optional filters only.
            if team_id:
                team_member_ids = (
                    select(user_teams.c.user_id)
                    .where(user_teams.c.team_id == team_id)
                    .scalar_subquery()
                )
                q = q.where(Task.assignee_id.in_(team_member_ids))
            if assignee_id:
                q = q.where(Task.assignee_id == assignee_id)

        elif requester.role == "superadmin":
            # Superadmin sees everything; optional filters
            if team_id:
                # Filter tasks whose assignee belongs to a given team (via junction)
                team_member_ids = (
                    select(user_teams.c.user_id)
                    .where(user_teams.c.team_id == team_id)
                    .scalar_subquery()
                )
                q = q.where(Task.assignee_id.in_(team_member_ids))
            if assignee_id:
                q = q.where(Task.assignee_id == assignee_id)

        elif requester.role == "team_manager":
            # Team manager sees tasks assigned to anyone in any of their teams
            my_team_member_ids = (
                select(user_teams.c.user_id)
                .where(
                    user_teams.c.team_id.in_(
                        select(user_teams.c.team_id).where(user_teams.c.user_id == requester.id)
                    )
                )
                .scalar_subquery()
            )
            q = q.where(Task.assignee_id.in_(my_team_member_ids))
            # Optional extra filters
            if assignee_id:
                q = q.where(Task.assignee_id == assignee_id)

        else:
            # Regular user: only sees tasks assigned to themselves
            q = q.where(Task.assignee_id == requester.id)

        # ── Extra filters ─────────────────────────────────────────────────────
        if board_id:
            q = q.join(KanbanColumn, Task.column_id == KanbanColumn.id).where(
                KanbanColumn.board_id == board_id
            )
        if column_id:
            q = q.where(Task.column_id == column_id)
        if priority:
            q = q.where(Task.priority == priority)
        if due_before:
            q = q.where(Task.due_date <= due_before)
        if search:
            q = q.where(Task.title.ilike(f"%{search}%"))
        if label_id:
            from app.models.task_label import task_label_assignments
            q = q.join(task_label_assignments, Task.id == task_label_assignments.c.task_id).where(
                task_label_assignments.c.label_id == label_id
            )

        total = (await self.db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        q = q.order_by(Task.column_id, Task.sort_order).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def _get_task(self, task_id: uuid.UUID) -> Task:
        result = await self.db.execute(
            select(Task)
            .options(
                selectinload(Task.assignee),
                selectinload(Task.creator),
                selectinload(Task.column),
                selectinload(Task.labels),
            )
            .where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            raise NotFoundError("Görev")
        return task

    async def _task_on_shared_board(self, task: Task) -> bool:
        """Return True if the task's board is a shared (non-personal) board."""
        if task.column is None:
            return False
        result = await self.db.execute(
            select(KanbanBoard.is_personal).where(KanbanBoard.id == task.column.board_id)
        )
        return result.scalar_one_or_none() is False

    async def get_task(self, task_id: uuid.UUID, requester: User) -> Task:
        task = await self._get_task(task_id)
        # Enforce same role-based access as list_tasks
        if requester.role == "superadmin":
            return task
        if requester.role == "team_manager":
            # Team manager can see tasks of users in any of their teams
            if task.assignee_id is not None:
                in_team = await self.db.execute(
                    select(user_teams.c.user_id).where(
                        user_teams.c.user_id == task.assignee_id,
                        user_teams.c.team_id.in_(
                            select(user_teams.c.team_id).where(user_teams.c.user_id == requester.id)
                        ),
                    ).limit(1)
                )
                if in_team.scalar_one_or_none():
                    return task
            # Manager created the task themselves
            if task.created_by == requester.id:
                return task
            if await self._task_on_shared_board(task):
                return task
            raise ForbiddenError("Bu göreve erişim yetkiniz yok.")
        # Regular user: own assigned/created tasks, or any task on a shared board
        if task.assignee_id == requester.id or task.created_by == requester.id:
            return task
        if await self._task_on_shared_board(task):
            return task
        raise ForbiddenError("Bu göreve erişim yetkiniz yok.")

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
        start_date: Optional[date] = None,
        label_ids: Optional[list[uuid.UUID]] = None,
    ) -> Task:
        # Auto-assign to creator if no assignee specified
        if assignee_id is None:
            assignee_id = created_by

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
            start_date=start_date,
            jira_ticket=jira_ticket,
            sort_order=sort_order,
        )
        self.db.add(task)
        await self.db.flush()

        # Assign labels via association table to avoid lazy-load greenlet issues
        if label_ids:
            from app.models.task_label import task_label_assignments as tla
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            await self.db.execute(
                pg_insert(tla).values(
                    [{'task_id': task.id, 'label_id': lid} for lid in label_ids]
                ).on_conflict_do_nothing()
            )

        await self.db.flush()
        # Re-query the task to include all loaded relationships (including labels)
        result = await self.db.execute(
            select(Task)
            .options(
                selectinload(Task.assignee),
                selectinload(Task.creator),
                selectinload(Task.column),
                selectinload(Task.labels),
            )
            .where(Task.id == task.id)
        )
        task = result.scalar_one()
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
        start_date: object = ...,    # Ellipsis = not sent; None = clear
        jira_ticket: object = ...,   # Ellipsis = not sent; None/"" = clear
        is_archived: Optional[bool] = None,
        label_ids: Optional[list[uuid.UUID]] = None,  # None = no change; [] = clear
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
        if start_date is not ...:
            old_start = task.start_date.isoformat() if task.start_date else None
            new_start = start_date.isoformat() if start_date else None  # type: ignore[union-attr]
            if old_start != new_start:
                changes.append({"field": "start_date", "old": old_start, "new": new_start})
            task.start_date = start_date  # type: ignore[assignment]
        if jira_ticket is not ...:
            new_jira = (jira_ticket or "").strip() or None
            if new_jira != task.jira_ticket:
                changes.append({"field": "jira_ticket", "old": task.jira_ticket, "new": new_jira})
            task.jira_ticket = new_jira
        if is_archived is not None and is_archived != task.is_archived:
            changes.append({"field": "archived", "old": str(task.is_archived), "new": str(is_archived)})
            task.is_archived = is_archived

        if label_ids is not None:
            # Use association table directly to avoid async lazy-load issues
            from app.models.task_label import task_label_assignments as tla
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            # Delete all existing label assignments
            await self.db.execute(
                tla.delete().where(tla.c.task_id == task_id)
            )
            # Insert new ones
            if label_ids:
                await self.db.execute(
                    pg_insert(tla).values(
                        [{'task_id': task_id, 'label_id': lid} for lid in label_ids]
                    ).on_conflict_do_nothing()
                )

        await self.db.flush()
        # Expire the cached task so the re-query fetches fresh relationship data
        # (especially the labels collection which was modified via raw SQL above)
        self.db.expire(task)
        # Re-query to get fresh state with all relationships loaded (avoids async lazy-load issues)
        result = await self.db.execute(
            select(Task)
            .options(
                selectinload(Task.assignee),
                selectinload(Task.creator),
                selectinload(Task.column),
                selectinload(Task.labels),
            )
            .where(Task.id == task_id)
            .execution_options(populate_existing=True)
        )
        task = result.scalar_one()

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

        old_column_id = task.column_id
        old_sort_order = task.sort_order
        old_col_name = task.column.name if task.column else str(task.column_id)

        if old_column_id == column_id:
            # Same-column reorder: shift tasks between old and new positions
            if old_sort_order < sort_order:
                # Moving down: tasks in (old, new] shift up by -1
                await self.db.execute(
                    sa_update(Task)
                    .where(
                        Task.column_id == column_id,
                        Task.id != task_id,
                        Task.is_archived == False,
                        Task.sort_order > old_sort_order,
                        Task.sort_order <= sort_order,
                    )
                    .values(sort_order=Task.sort_order - 1)
                )
            elif old_sort_order > sort_order:
                # Moving up: tasks in [new, old) shift down by +1
                await self.db.execute(
                    sa_update(Task)
                    .where(
                        Task.column_id == column_id,
                        Task.id != task_id,
                        Task.is_archived == False,
                        Task.sort_order >= sort_order,
                        Task.sort_order < old_sort_order,
                    )
                    .values(sort_order=Task.sort_order + 1)
                )
        else:
            # Cross-column: close gap in old column, make room in new column
            await self.db.execute(
                sa_update(Task)
                .where(
                    Task.column_id == old_column_id,
                    Task.id != task_id,
                    Task.is_archived == False,
                    Task.sort_order > old_sort_order,
                )
                .values(sort_order=Task.sort_order - 1)
            )
            await self.db.execute(
                sa_update(Task)
                .where(
                    Task.column_id == column_id,
                    Task.is_archived == False,
                    Task.sort_order >= sort_order,
                )
                .values(sort_order=Task.sort_order + 1)
            )

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

    # ─── Subtasks ─────────────────────────────────────────────────────────────

    async def list_subtasks(self, task_id: uuid.UUID) -> list[TaskSubtask]:
        result = await self.db.execute(
            select(TaskSubtask).where(TaskSubtask.task_id == task_id).order_by(TaskSubtask.sort_order)
        )
        return list(result.scalars().all())

    async def create_subtask(self, task_id: uuid.UUID, data: SubtaskCreate, requester: Optional[User] = None) -> TaskSubtask:
        # Verify task access
        if requester:
            await self.get_task(task_id, requester)
        subtask = TaskSubtask(task_id=task_id, **data.model_dump())
        self.db.add(subtask)
        await self.db.flush()
        await self.db.refresh(subtask)
        return subtask

    async def update_subtask(self, task_id: uuid.UUID, subtask_id: uuid.UUID, data: SubtaskUpdate, requester: Optional[User] = None) -> TaskSubtask:
        from fastapi import HTTPException
        # Verify task access
        if requester:
            await self.get_task(task_id, requester)
        result = await self.db.execute(
            select(TaskSubtask).where(TaskSubtask.id == subtask_id, TaskSubtask.task_id == task_id)
        )
        subtask = result.scalar_one_or_none()
        if not subtask:
            raise HTTPException(status_code=404, detail="Alt görev bulunamadı.")
        for k, v in data.model_dump(exclude_none=True).items():
            setattr(subtask, k, v)
        await self.db.flush()
        await self.db.refresh(subtask)
        return subtask

    async def delete_subtask(self, task_id: uuid.UUID, subtask_id: uuid.UUID, requester: Optional[User] = None) -> None:
        from fastapi import HTTPException
        # Verify task access
        if requester:
            await self.get_task(task_id, requester)
        result = await self.db.execute(
            select(TaskSubtask).where(TaskSubtask.id == subtask_id, TaskSubtask.task_id == task_id)
        )
        subtask = result.scalar_one_or_none()
        if not subtask:
            raise HTTPException(status_code=404, detail="Alt görev bulunamadı.")
        await self.db.delete(subtask)
        await self.db.flush()

    async def list_all_history(
        self,
        limit: int = 100,
        skip: int = 0,
        task_id: Optional[uuid.UUID] = None,
    ) -> tuple[list, int]:
        from app.models.task_history import TaskHistory

        q = select(TaskHistory).options(
            selectinload(TaskHistory.actor)
        )
        if task_id:
            q = q.where(TaskHistory.task_id == task_id)

        total_result = await self.db.execute(select(func.count()).select_from(q.subquery()))
        total = total_result.scalar_one()

        items_result = await self.db.execute(
            q.order_by(TaskHistory.created_at.desc()).offset(skip).limit(limit)
        )
        return list(items_result.scalars().all()), total

    # ─── Attachments ──────────────────────────────────────────────────────────

    async def list_attachments(self, task_id: uuid.UUID) -> list:
        from app.models.task_attachment import TaskAttachment
        result = await self.db.execute(
            select(TaskAttachment)
            .where(TaskAttachment.task_id == task_id)
            .order_by(TaskAttachment.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_attachment(
        self,
        task_id: uuid.UUID,
        filename: str,
        original_filename: str,
        file_size: int,
        mime_type: str,
        uploaded_by: uuid.UUID,
    ) -> object:
        from app.models.task_attachment import TaskAttachment
        att = TaskAttachment(
            task_id=task_id,
            filename=filename,
            original_filename=original_filename,
            file_size=file_size,
            mime_type=mime_type,
            uploaded_by=uploaded_by,
        )
        self.db.add(att)
        await self.db.flush()
        await self.db.refresh(att)
        return att

    async def delete_attachment(self, task_id: uuid.UUID, attachment_id: uuid.UUID) -> None:
        import os
        from app.models.task_attachment import TaskAttachment
        result = await self.db.execute(
            select(TaskAttachment).where(
                TaskAttachment.id == attachment_id,
                TaskAttachment.task_id == task_id,
            )
        )
        att = result.scalar_one_or_none()
        if not att:
            raise NotFoundError("Dosya eki")
        # Path traversal guard before deleting from disk
        upload_dir = os.path.realpath("/app/uploads")
        file_path = os.path.realpath(os.path.join(upload_dir, att.filename))
        if file_path.startswith(upload_dir + os.sep) and os.path.exists(file_path):
            os.remove(file_path)
        await self.db.delete(att)
        await self.db.flush()

    # ─── Bulk Operations ──────────────────────────────────────────────────────

    async def bulk_update_tasks(
        self,
        task_ids: list[uuid.UUID],
        column_id: Optional[uuid.UUID] = None,
        assignee_id: Optional[uuid.UUID] = None,
        priority: Optional[str] = None,
        is_archived: Optional[bool] = None,
        requester: Optional[User] = None,
    ) -> int:
        if not task_ids:
            return 0
        # Limit to prevent DoS via large batch
        if len(task_ids) > 200:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="En fazla 200 görev aynı anda güncellenebilir.")
        # Validate access for every task using the same junction-table ACL as get_task().
        # This prevents BOLA: an attacker passing arbitrary task IDs in a bulk request
        # cannot bypass per-task authorization the way the old FK-based check allowed.
        tasks: list[Task] = []
        for tid in task_ids:
            if requester:
                task = await self.get_task(tid, requester)  # raises ForbiddenError if unauthorized
            else:
                task = await self._get_task(tid)
            tasks.append(task)

        for task in tasks:
            if column_id is not None:
                task.column_id = column_id
            if assignee_id is not None:
                task.assignee_id = assignee_id
            if priority is not None:
                task.priority = priority
            if is_archived is not None:
                task.is_archived = is_archived
        await self.db.flush()
        return len(tasks)
