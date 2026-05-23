import uuid
from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.leave_request import LeaveRequest
from app.models.user import User

ALLOWED_STATUSES = {"cancelled"}


class LeaveService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _is_manager_or_admin(self, user: User) -> bool:
        return user.role in ("superadmin", "team_manager")

    async def create_leave(
        self,
        user_id: uuid.UUID,
        start_date: date,
        end_date: date,
        reason: Optional[str],
    ) -> LeaveRequest:
        if start_date > end_date:
            raise HTTPException(status_code=422, detail="Başlangıç tarihi bitiş tarihinden sonra olamaz.")

        leave = LeaveRequest(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            reason=reason,
            status="approved",
        )
        self.db.add(leave)
        await self.db.flush()

        result = await self.db.execute(
            select(LeaveRequest)
            .where(LeaveRequest.id == leave.id)
            .options(selectinload(LeaveRequest.user), selectinload(LeaveRequest.reviewer))
        )
        return result.scalar_one()

    async def list_leaves(
        self,
        requester: User,
        user_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> list[LeaveRequest]:
        query = select(LeaveRequest).options(
            selectinload(LeaveRequest.user),
            selectinload(LeaveRequest.reviewer),
        )

        if self._is_manager_or_admin(requester):
            if user_id is not None:
                query = query.where(LeaveRequest.user_id == user_id)
        else:
            query = query.where(LeaveRequest.user_id == requester.id)

        if status is not None:
            query = query.where(LeaveRequest.status == status)
        if date_from is not None:
            query = query.where(LeaveRequest.end_date >= date_from)
        if date_to is not None:
            query = query.where(LeaveRequest.start_date <= date_to)

        query = query.order_by(LeaveRequest.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_leave(self, leave_id: uuid.UUID, requester: User) -> LeaveRequest:
        result = await self.db.execute(
            select(LeaveRequest)
            .where(LeaveRequest.id == leave_id)
            .options(selectinload(LeaveRequest.user), selectinload(LeaveRequest.reviewer))
        )
        leave = result.scalar_one_or_none()
        if not leave:
            raise HTTPException(status_code=404, detail="İzin talebi bulunamadı.")
        if not self._is_manager_or_admin(requester) and leave.user_id != requester.id:
            raise HTTPException(status_code=403, detail="Bu izin talebine erişim yetkiniz yok.")
        return leave

    async def update_leave(
        self,
        leave_id: uuid.UUID,
        requester: User,
        status: Optional[str] = None,
        review_note: Optional[str] = None,
    ) -> LeaveRequest:
        result = await self.db.execute(
            select(LeaveRequest)
            .where(LeaveRequest.id == leave_id)
            .options(selectinload(LeaveRequest.user), selectinload(LeaveRequest.reviewer))
        )
        leave = result.scalar_one_or_none()
        if not leave:
            raise HTTPException(status_code=404, detail="İzin talebi bulunamadı.")

        if status is not None and status != "cancelled":
            raise HTTPException(status_code=422, detail="Yalnızca iptal (cancelled) işlemi yapılabilir.")

        if self._is_manager_or_admin(requester):
            # Managers/admins can cancel any non-cancelled leave and add a note
            if status == "cancelled":
                if leave.status == "cancelled":
                    raise HTTPException(status_code=422, detail="Bu izin talebi zaten iptal edilmiş.")
                leave.status = "cancelled"
            if review_note is not None:
                leave.review_note = review_note
        else:
            # Regular users can only cancel their own non-cancelled leaves
            if leave.user_id != requester.id:
                raise HTTPException(status_code=403, detail="Bu izin talebini güncelleme yetkiniz yok.")
            if status == "cancelled":
                if leave.status == "cancelled":
                    raise HTTPException(status_code=422, detail="Bu izin talebi zaten iptal edilmiş.")
                leave.status = "cancelled"

        await self.db.flush()

        # Re-fetch with populate_existing=True so SQLAlchemy overwrites the cached instance
        # (needed because we set reviewed_by FK directly; the relationship won't auto-refresh)
        result = await self.db.execute(
            select(LeaveRequest)
            .where(LeaveRequest.id == leave_id)
            .options(selectinload(LeaveRequest.user), selectinload(LeaveRequest.reviewer))
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    async def delete_leave(self, leave_id: uuid.UUID, requester: User) -> None:
        if requester.role != "superadmin":
            raise HTTPException(status_code=403, detail="Yalnızca superadmin izin talebini silebilir.")

        result = await self.db.execute(
            select(LeaveRequest).where(LeaveRequest.id == leave_id)
        )
        leave = result.scalar_one_or_none()
        if not leave:
            raise HTTPException(status_code=404, detail="İzin talebi bulunamadı.")

        await self.db.delete(leave)
        await self.db.flush()
