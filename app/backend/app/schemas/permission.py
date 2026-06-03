import uuid
from typing import Optional
from enum import Enum
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


class BulkCellAction(str, Enum):
    skip = "skip"
    grant = "grant"
    deny = "deny"
    reset = "reset"


class BulkPermissionItem(BaseModel):
    module: str
    action: str
    cell_action: BulkCellAction


class BulkApplyPermissionsRequest(BaseModel):
    items: list[BulkPermissionItem]
    role_filter: Optional[str] = None  # None = all non-superadmin, 'user', 'team_manager'


class BulkApplyPermissionsResponse(BaseModel):
    affected_users: int
    message: str
