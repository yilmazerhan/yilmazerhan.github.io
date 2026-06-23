import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.responsibility import ResponsibilityGroup, ResponsibilityMember
from app.core.exceptions import NotFoundError, ConflictError


class ResponsibilityService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_groups(self) -> list[ResponsibilityGroup]:
        result = await self.db.execute(
            select(ResponsibilityGroup).order_by(
                ResponsibilityGroup.display_order, ResponsibilityGroup.created_at
            )
        )
        return list(result.scalars().all())

    async def get_group(self, group_id: uuid.UUID) -> ResponsibilityGroup:
        result = await self.db.execute(
            select(ResponsibilityGroup).where(ResponsibilityGroup.id == group_id)
        )
        group = result.scalar_one_or_none()
        if not group:
            raise NotFoundError("Sorumluluk grubu")
        return group

    async def create_group(
        self,
        name: str,
        description: Optional[str],
        color: str,
        display_order: int,
    ) -> ResponsibilityGroup:
        group = ResponsibilityGroup(
            name=name,
            description=description,
            color=color,
            display_order=display_order,
        )
        self.db.add(group)
        await self.db.flush()
        return group

    async def update_group(self, group_id: uuid.UUID, **kwargs) -> ResponsibilityGroup:
        group = await self.get_group(group_id)
        for k, v in kwargs.items():
            setattr(group, k, v)
        await self.db.flush()
        return group

    async def delete_group(self, group_id: uuid.UUID) -> None:
        group = await self.get_group(group_id)
        await self.db.delete(group)
        await self.db.flush()

    async def get_member(self, member_id: uuid.UUID) -> ResponsibilityMember:
        result = await self.db.execute(
            select(ResponsibilityMember).where(ResponsibilityMember.id == member_id)
        )
        member = result.scalar_one_or_none()
        if not member:
            raise NotFoundError("Üye")
        return member

    async def add_member(
        self,
        group_id: uuid.UUID,
        user_id: uuid.UUID,
        modules: list[str],
    ) -> ResponsibilityMember:
        await self.get_group(group_id)
        existing = await self.db.execute(
            select(ResponsibilityMember).where(
                ResponsibilityMember.group_id == group_id,
                ResponsibilityMember.user_id == user_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ConflictError("Bu kullanıcı zaten bu grupta.")
        member = ResponsibilityMember(group_id=group_id, user_id=user_id, modules=modules)
        self.db.add(member)
        await self.db.flush()
        return member

    async def update_member(self, member_id: uuid.UUID, modules: list[str]) -> ResponsibilityMember:
        member = await self.get_member(member_id)
        member.modules = modules
        await self.db.flush()
        return member

    async def remove_member(self, member_id: uuid.UUID) -> None:
        member = await self.get_member(member_id)
        await self.db.delete(member)
        await self.db.flush()
