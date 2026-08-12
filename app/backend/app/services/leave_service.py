import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.leave_request import LeaveRequest
from app.models.user import User
from app.models.user_team import user_teams

MANAGER_STATUSES = {"approved", "rejected", "cancelled"}
USER_STATUSES = {"cancelled"}


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
            status="pending",  # Requires manager/superadmin approval via PATCH /leaves/{id}
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

        if requester.role == "superadmin":
            if user_id is not None:
                query = query.where(LeaveRequest.user_id == user_id)
        elif requester.role == "team_manager":
            # Scope to users in the manager's teams (junction table is authoritative)
            my_team_ids = select(user_teams.c.team_id).where(user_teams.c.user_id == requester.id)
            team_member_ids = select(user_teams.c.user_id).where(user_teams.c.team_id.in_(my_team_ids))
            query = query.where(LeaveRequest.user_id.in_(team_member_ids))
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

        if self._is_manager_or_admin(requester):
            # team_manager: verify the leave owner is in one of their teams
            if requester.role == "team_manager":
                my_team_ids = select(user_teams.c.team_id).where(user_teams.c.user_id == requester.id)
                shared = await self.db.execute(
                    select(user_teams.c.team_id).where(
                        user_teams.c.user_id == leave.user_id,
                        user_teams.c.team_id.in_(my_team_ids),
                    ).limit(1)
                )
                if not shared.scalar_one_or_none():
                    raise HTTPException(status_code=403, detail="Bu izin talebini güncelleme yetkiniz yok.")
            # Managers / admins: can approve, reject, or cancel any leave
            if status is not None:
                if status not in MANAGER_STATUSES:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Geçersiz durum. Kabul edilenler: {', '.join(sorted(MANAGER_STATUSES))}"
                    )
                if leave.status == status:
                    raise HTTPException(status_code=422, detail=f"İzin talebi zaten '{status}' durumunda.")
                # Once approved/rejected, only cancellation is allowed (can't re-approve a rejected leave)
                if leave.status in ("approved", "rejected") and status not in ("cancelled",):
                    raise HTTPException(
                        status_code=422, detail="Onaylanmış/reddedilmiş izin yalnızca iptal edilebilir."
                    )
                leave.status = status
                leave.reviewed_by = requester.id
                leave.reviewed_at = datetime.now(timezone.utc)
            if review_note is not None:
                leave.review_note = review_note
        else:
            # Regular users: can only cancel their own pending leave
            if leave.user_id != requester.id:
                raise HTTPException(status_code=403, detail="Bu izin talebini güncelleme yetkiniz yok.")
            if status is not None:
                if status not in USER_STATUSES:
                    raise HTTPException(
                        status_code=403,
                        detail="Kullanıcılar yalnızca kendi izinlerini iptal edebilir."
                    )
                if leave.status != "pending":
                    raise HTTPException(
                        status_code=422,
                        detail="Yalnızca beklemedeki (pending) izin talepleri iptal edilebilir."
                    )
                leave.status = "cancelled"

        await self.db.flush()

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
