import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.permission import PermissionOverride
from app.models.user import User
from app.core.permissions import get_effective_permissions, ALL_MODULES, ALL_ACTIONS
from app.core.exceptions import NotFoundError, ValidationError


class PermissionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_overrides_for_user(self, user_id: uuid.UUID) -> list[PermissionOverride]:
        result = await self.db.execute(
            select(PermissionOverride).where(PermissionOverride.user_id == user_id)
        )
        return list(result.scalars().all())

    async def get_effective_permissions(self, user_id: uuid.UUID) -> dict:
        result = await self.db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Kullanıcı")
        overrides = await self.get_overrides_for_user(user_id)
        return get_effective_permissions(user, overrides)

    async def set_overrides(
        self,
        user_id: uuid.UUID,
        overrides: list[dict],
        set_by: uuid.UUID,
    ) -> list[PermissionOverride]:
        # Validate user exists
        result = await self.db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Kullanıcı")
        if user.role == "superadmin":
            raise ValidationError("Superadmin yetkisi değiştirilemez.")

        # Validate override data
        for o in overrides:
            if o.get("module") not in ALL_MODULES:
                raise ValidationError(f"Geçersiz modül: {o.get('module')}")
            if o.get("action") not in ALL_ACTIONS:
                raise ValidationError(f"Geçersiz aksiyon: {o.get('action')}")

        # Delete existing overrides and re-insert
        await self.db.execute(
            delete(PermissionOverride).where(PermissionOverride.user_id == user_id)
        )

        new_overrides = []
        for o in overrides:
            override = PermissionOverride(
                user_id=user_id,
                module=o["module"],
                action=o["action"],
                is_allowed=o["is_allowed"],
                created_by=set_by,
            )
            self.db.add(override)
            new_overrides.append(override)

        await self.db.flush()
        return new_overrides

    async def delete_override(self, user_id: uuid.UUID, module: str, action: str) -> None:
        if module not in ALL_MODULES or action not in ALL_ACTIONS:
            raise ValidationError("Geçersiz modül veya aksiyon.")
        await self.db.execute(
            delete(PermissionOverride).where(
                PermissionOverride.user_id == user_id,
                PermissionOverride.module == module,
                PermissionOverride.action == action,
            )
        )

    async def bulk_apply_permissions(
        self,
        items: list[dict],
        role_filter: Optional[str],
        set_by: uuid.UUID,
    ) -> dict:
        non_skip = [i for i in items if i["cell_action"] != "skip"]
        if not non_skip:
            return {"affected_users": 0, "message": "Değiştirilecek hücre seçilmedi."}

        for item in non_skip:
            if item["module"] not in ALL_MODULES:
                raise ValidationError(f"Geçersiz modül: {item['module']}")
            if item["action"] not in ALL_ACTIONS:
                raise ValidationError(f"Geçersiz aksiyon: {item['action']}")

        query = select(User).where(User.is_deleted == False, User.role != "superadmin")
        if role_filter in ("user", "team_manager"):
            query = query.where(User.role == role_filter)
        result = await self.db.execute(query)
        users = list(result.scalars().all())

        for user in users:
            for item in non_skip:
                module = item["module"]
                action = item["action"]
                cell_action = item["cell_action"]
                await self.db.execute(
                    delete(PermissionOverride).where(
                        PermissionOverride.user_id == user.id,
                        PermissionOverride.module == module,
                        PermissionOverride.action == action,
                    )
                )
                if cell_action in ("grant", "deny"):
                    self.db.add(PermissionOverride(
                        user_id=user.id,
                        module=module,
                        action=action,
                        is_allowed=(cell_action == "grant"),
                        created_by=set_by,
                    ))

        await self.db.flush()
        return {"affected_users": len(users), "message": f"{len(users)} kullanıcı güncellendi."}
