import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.worklog import WorkLog, WorkType
from app.models.user import User
from app.core.permissions import can_edit_worklog, can_delete_worklog
from app.core.exceptions import (
    NotFoundError, ForbiddenError, ValidationError
)


class WorkLogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Work Types ──────────────────────────────────────────────────────────
    async def list_work_types(self, active_only: bool = True) -> list[WorkType]:
        q = select(WorkType)
        if active_only:
            q = q.where(WorkType.is_active == True)
        q = q.order_by(WorkType.sort_order, WorkType.name)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def create_work_type(self, name: str, color: str, sort_order: int, created_by: uuid.UUID) -> WorkType:
        exists = await self.db.execute(select(WorkType).where(WorkType.name == name))
        if exists.scalar_one_or_none():
            from app.core.exceptions import ConflictError
            raise ConflictError("Bu isimde bir iş tipi zaten mevcut.")
        wt = WorkType(name=name, color=color, sort_order=sort_order, created_by=created_by)
        self.db.add(wt)
        await self.db.flush()
        return wt

    async def update_work_type(self, wt_id: uuid.UUID, name: Optional[str], color: Optional[str], sort_order: Optional[int], is_active: Optional[bool]) -> WorkType:
        result = await self.db.execute(select(WorkType).where(WorkType.id == wt_id))
        wt = result.scalar_one_or_none()
        if not wt:
            raise NotFoundError("İş tipi")
        if name and name != wt.name:
            from app.core.exceptions import ConflictError
            exists = await self.db.execute(select(WorkType).where(WorkType.name == name))
            if exists.scalar_one_or_none():
                raise ConflictError("Bu isimde bir iş tipi zaten mevcut.")
            wt.name = name
        if color is not None:
            wt.color = color
        if sort_order is not None:
            wt.sort_order = sort_order
        if is_active is not None:
            wt.is_active = is_active
        await self.db.flush()
        return wt

    async def delete_work_type(self, wt_id: uuid.UUID) -> None:
        result = await self.db.execute(select(WorkType).where(WorkType.id == wt_id))
        wt = result.scalar_one_or_none()
        if not wt:
            raise NotFoundError("İş tipi")
        # Check if in use
        in_use = await self.db.execute(select(func.count()).where(WorkLog.work_type_id == wt_id))
        if in_use.scalar_one() > 0:
            wt.is_active = False  # soft deactivate if in use
        else:
            await self.db.delete(wt)
        await self.db.flush()

    # ─── Work Logs ───────────────────────────────────────────────────────────
    async def list_logs(
        self,
        requester: User,
        user_id: Optional[uuid.UUID] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[WorkLog], int]:
        q = (
            select(WorkLog)
            .options(
                selectinload(WorkLog.user),
                selectinload(WorkLog.work_type),
            )
        )

        # Scope by role
        if requester.role == "user":
            q = q.where(WorkLog.user_id == requester.id)
        elif requester.role == "team_manager":
            # Can see own team's logs
            from app.models.user import User as UserModel
            q = q.join(UserModel, WorkLog.user_id == UserModel.id).where(
                UserModel.team_id == requester.team_id
            )
            if user_id:
                q = q.where(WorkLog.user_id == user_id)
        else:  # superadmin
            if user_id:
                q = q.where(WorkLog.user_id == user_id)

        if date_from:
            q = q.where(WorkLog.log_date >= date_from)
        if date_to:
            q = q.where(WorkLog.log_date <= date_to)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        q = q.order_by(WorkLog.log_date.desc(), WorkLog.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def create_log(
        self,
        user_id: uuid.UUID,
        work_type_id: uuid.UUID,
        log_date: date,
        duration_hours: float,
        description: str,
    ) -> WorkLog:
        if not (0.25 <= duration_hours <= 24):
            raise ValidationError("Süre 0.25 ile 24 saat arasında olmalıdır.")
        if log_date > date.today():
            raise ValidationError("Gelecek tarih için kayıt oluşturulamaz.")

        wt_exists = await self.db.execute(select(WorkType).where(WorkType.id == work_type_id, WorkType.is_active == True))
        if not wt_exists.scalar_one_or_none():
            raise NotFoundError("İş tipi")

        log = WorkLog(
            user_id=user_id,
            work_type_id=work_type_id,
            log_date=log_date,
            duration_hours=Decimal(str(duration_hours)),
            description=description,
        )
        self.db.add(log)
        await self.db.flush()
        await self.db.refresh(log, ["user", "work_type"])
        return log

    async def _get_log_with_user(self, log_id: uuid.UUID) -> WorkLog:
        result = await self.db.execute(
            select(WorkLog)
            .options(selectinload(WorkLog.user), selectinload(WorkLog.work_type))
            .where(WorkLog.id == log_id)
        )
        log = result.scalar_one_or_none()
        if not log:
            raise NotFoundError("İş günlüğü kaydı")
        return log

    async def get_log(self, log_id: uuid.UUID, requester: User) -> WorkLog:
        log = await self._get_log_with_user(log_id)
        if requester.role == "user" and log.user_id != requester.id:
            raise ForbiddenError()
        if requester.role == "team_manager" and log.user.team_id != requester.team_id:
            raise ForbiddenError()
        return log

    async def update_log(
        self,
        log_id: uuid.UUID,
        requester: User,
        work_type_id: Optional[uuid.UUID] = None,
        log_date: Optional[date] = None,
        duration_hours: Optional[float] = None,
        description: Optional[str] = None,
    ) -> WorkLog:
        log = await self._get_log_with_user(log_id)

        if not can_edit_worklog(requester, log):
            age = (date.today() - log.log_date).days
            if age > 3:
                raise ForbiddenError("3 günden eski kayıtları yalnızca ekip yöneticisi veya superadmin düzenleyebilir.")
            raise ForbiddenError("Bu kaydı düzenleme yetkiniz yok.")

        if work_type_id is not None:
            wt_exists = await self.db.execute(select(WorkType).where(WorkType.id == work_type_id, WorkType.is_active == True))
            if not wt_exists.scalar_one_or_none():
                raise NotFoundError("İş tipi")
            log.work_type_id = work_type_id
        if log_date is not None:
            if log_date > date.today():
                raise ValidationError("Gelecek tarih için kayıt oluşturulamaz.")
            log.log_date = log_date
        if duration_hours is not None:
            if not (0.25 <= duration_hours <= 24):
                raise ValidationError("Süre 0.25 ile 24 saat arasında olmalıdır.")
            log.duration_hours = Decimal(str(duration_hours))
        if description is not None:
            log.description = description

        await self.db.flush()
        return log

    async def delete_log(self, log_id: uuid.UUID, requester: User) -> None:
        log = await self._get_log_with_user(log_id)
        if not can_delete_worklog(requester, log):
            raise ForbiddenError("Bu kaydı silme yetkiniz yok.")
        await self.db.delete(log)
        await self.db.flush()

    async def summary_stats(
        self,
        requester: User,
        user_id: Optional[uuid.UUID] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> dict:
        q = select(
            WorkType.name,
            WorkType.color,
            func.sum(WorkLog.duration_hours).label("total_hours"),
            func.count(WorkLog.id).label("entry_count"),
        ).join(WorkType, WorkLog.work_type_id == WorkType.id)

        if requester.role == "user":
            q = q.where(WorkLog.user_id == requester.id)
        elif requester.role == "team_manager":
            from app.models.user import User as UserModel
            q = q.join(UserModel, WorkLog.user_id == UserModel.id).where(
                UserModel.team_id == requester.team_id
            )
        if user_id and requester.role != "user":
            q = q.where(WorkLog.user_id == user_id)
        if date_from:
            q = q.where(WorkLog.log_date >= date_from)
        if date_to:
            q = q.where(WorkLog.log_date <= date_to)

        q = q.group_by(WorkType.name, WorkType.color)
        result = await self.db.execute(q)
        rows = result.all()
        return {
            "by_type": [
                {"name": r.name, "color": r.color, "total_hours": float(r.total_hours or 0), "entry_count": r.entry_count}
                for r in rows
            ],
            "total_hours": sum(float(r.total_hours or 0) for r in rows),
        }
