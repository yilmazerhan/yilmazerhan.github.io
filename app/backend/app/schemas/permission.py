import uuid
from pydantic import BaseModel
from app.core.permissions import ALL_MODULES, ALL_ACTIONS


class PermissionOverrideItem(BaseModel):
    module: str
    action: str
    is_allowed: bool


class PermissionOverrideResponse(PermissionOverrideItem):
    id: uuid.UUID
    user_id: uuid.UUID
    model_config = {"from_attributes": True}


class SetPermissionsRequest(BaseModel):
    overrides: list[PermissionOverrideItem]


class EffectivePermissions(BaseModel):
    user_id: uuid.UUID
    role: str
    permissions: dict[str, dict[str, bool]]
