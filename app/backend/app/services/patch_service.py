import uuid
from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, cast, Text
from sqlalchemy.orm import selectinload

from app.models.patch import CustomerPatch, Customer
from app.models.user import User
from app.models.user_team import user_teams
from app.schemas.patch import PatchCreate, PatchUpdate, CustomerCreate
from app.core.exceptions import NotFoundError, ForbiddenError, ConflictError


class PatchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Customer CRUD ────────────────────────────────────────────────────────

    async def list_customers(self) -> list[Customer]:
        result = await self.db.execute(
            select(Customer).order_by(Customer.name)
        )
        return list(result.scalars().all())

    async def create_customer(self, data: CustomerCreate) -> Customer:
        existing = await self.db.execute(
            select(Customer).where(Customer.name == data.name.strip())
        )
        if existing.scalar_one_or_none():
            raise ConflictError("Bu isimde bir müşteri zaten mevcut.")

        customer = Customer(name=data.name.strip())
        self.db.add(customer)
        await self.db.flush()
        await self.db.refresh(customer)
        return customer

    # ─── Patch CRUD ───────────────────────────────────────────────────────────

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
            _safe = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{_safe}%"
            q = q.where(
                or_(
                    cast(CustomerPatch.customers, Text).ilike(pattern),
                    cast(CustomerPatch.patch_files, Text).ilike(pattern),
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
            customers=data.customers,
            patch_files=[pf.model_dump() for pf in data.patch_files],
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

    async def _check_permission(self, patch: CustomerPatch, requester: User) -> None:
        if requester.role == "superadmin":
            return
        if patch.created_by == requester.id:
            return
        if requester.role == "team_manager":
            # A manager may only modify patches created by someone in one of their
            # teams. Previously ANY team_manager could edit or delete ANY patch —
            # including another team's record of which binary/md5 was shipped to
            # which customer, which is the module's audit trail.
            if patch.created_by is None:
                raise ForbiddenError()
            shared = await self.db.execute(
                select(user_teams.c.team_id).where(
                    user_teams.c.user_id == requester.id,
                    user_teams.c.team_id.in_(
                        select(user_teams.c.team_id).where(
                            user_teams.c.user_id == patch.created_by
                        )
                    ),
                ).limit(1)
            )
            if shared.scalar_one_or_none():
                return
        raise ForbiddenError()

    async def update_patch(
        self, patch_id: uuid.UUID, data: PatchUpdate, requester: User
    ) -> CustomerPatch:
        patch = await self.get_patch(patch_id)
        await self._check_permission(patch, requester)

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(patch, field, value)

        await self.db.flush()
        return await self.get_patch(patch_id)

    async def delete_patch(self, patch_id: uuid.UUID, requester: User) -> None:
        patch = await self.get_patch(patch_id)
        await self._check_permission(patch, requester)
        await self.db.delete(patch)
        await self.db.flush()
