import uuid
from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.models.patch import CustomerPatch
from app.models.user import User
from app.schemas.patch import PatchCreate, PatchUpdate
from app.core.exceptions import NotFoundError, ForbiddenError


class PatchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_patches(
        self,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None,
        status: Optional[str] = None,
        environment: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> tuple[list[CustomerPatch], int]:
        q = select(CustomerPatch).options(selectinload(CustomerPatch.created_by_user))

        if search:
            pattern = f"%{search}%"
            q = q.where(
                or_(
                    CustomerPatch.customer.ilike(pattern),
                    CustomerPatch.jira_ticket.ilike(pattern),
                    CustomerPatch.app_version.ilike(pattern),
                    CustomerPatch.description.ilike(pattern),
                )
            )
        if status:
            q = q.where(CustomerPatch.status == status)
        if environment:
            q = q.where(CustomerPatch.environment == environment)
        if date_from:
            q = q.where(CustomerPatch.apply_date >= date_from)
        if date_to:
            q = q.where(CustomerPatch.apply_date <= date_to)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        q = q.order_by(CustomerPatch.apply_date.desc(), CustomerPatch.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def create_patch(self, data: PatchCreate, created_by_id: uuid.UUID) -> CustomerPatch:
        patch = CustomerPatch(
            customer=data.customer,
            jira_ticket=data.jira_ticket,
            app_version=data.app_version,
            apply_date=data.apply_date,
            environment=data.environment,
            status=data.status,
            description=data.description,
            created_by=created_by_id,
        )
        self.db.add(patch)
        await self.db.flush()
        # Re-query so created_by_user is loaded via selectinload (refresh() alone
        # does not trigger the selectin strategy for relationships).
        return await self.get_patch(patch.id)

    async def get_patch(self, patch_id: uuid.UUID) -> CustomerPatch:
        result = await self.db.execute(
            select(CustomerPatch)
            .options(selectinload(CustomerPatch.created_by_user))
            .where(CustomerPatch.id == patch_id)
        )
        patch = result.scalar_one_or_none()
        if not patch:
            raise NotFoundError("Müşteri yaması")
        return patch

    def _check_permission(self, patch: CustomerPatch, requester: User) -> None:
        if requester.role in ("superadmin", "team_manager"):
            return
        if patch.created_by == requester.id:
            return
        raise ForbiddenError()

    async def update_patch(
        self, patch_id: uuid.UUID, data: PatchUpdate, requester: User
    ) -> CustomerPatch:
        patch = await self.get_patch(patch_id)
        self._check_permission(patch, requester)

        # exclude_unset so that fields not sent in the request are left unchanged,
        # but explicitly null-ed fields (e.g. jira_ticket: null) ARE applied.
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(patch, field, value)

        await self.db.flush()
        return patch

    async def delete_patch(self, patch_id: uuid.UUID, requester: User) -> None:
        patch = await self.get_patch(patch_id)
        self._check_permission(patch, requester)
        await self.db.delete(patch)
        await self.db.flush()
