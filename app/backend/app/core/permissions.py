from datetime import date
from typing import Optional
import uuid

from app.models.user import User
from app.models.worklog import WorkLog
from app.models.kanban import Task


# ─── Role default permissions ─────────────────────────────────────────────
# Structure: role -> module -> set of allowed actions
ROLE_DEFAULTS: dict[str, dict[str, set[str]]] = {
    "superadmin": {
        "worklog": {"create", "edit", "delete", "view"},
        "kanban": {"create", "edit", "delete", "view"},
        "user_management": {"create", "edit", "delete", "view"},
        "email_workflows": {"create", "edit", "delete", "view"},
        "jira_config": {"create", "edit", "delete", "view"},
        "ssl_management": {"create", "edit", "delete", "view"},
        "branding": {"create", "edit", "delete", "view"},
    },
    "team_manager": {
        "worklog": {"create", "edit", "delete", "view"},
        "kanban": {"create", "edit", "delete", "view"},
        "user_management": {"view"},
        "email_workflows": {"view"},
        "jira_config": set(),
        "ssl_management": set(),
        "branding": set(),
    },
    "user": {
        "worklog": {"create", "view"},
        "kanban": {"create", "view"},
        "user_management": set(),
        "email_workflows": set(),
        "jira_config": set(),
        "ssl_management": set(),
        "branding": set(),
    },
}

ALL_MODULES = list(ROLE_DEFAULTS["superadmin"].keys())
ALL_ACTIONS = ["create", "edit", "delete", "view"]


def get_effective_permissions(user: User, overrides: list) -> dict[str, dict[str, bool]]:
    """Compute effective permissions = role defaults + overrides."""
    if user.role == "superadmin":
        return {m: {a: True for a in ALL_ACTIONS} for m in ALL_MODULES}

    effective: dict[str, dict[str, bool]] = {}
    role_perms = ROLE_DEFAULTS.get(user.role, {})

    for module in ALL_MODULES:
        effective[module] = {}
        for action in ALL_ACTIONS:
            effective[module][action] = action in role_perms.get(module, set())

    for override in overrides:
        if override.module in effective:
            effective[override.module][override.action] = override.is_allowed

    return effective


def has_permission(user: User, overrides: list, module: str, action: str) -> bool:
    if user.role == "superadmin":
        return True

    for override in overrides:
        if override.module == module and override.action == action:
            return override.is_allowed

    return action in ROLE_DEFAULTS.get(user.role, {}).get(module, set())


# ─── Work Log ────────────────────────────────────────────────────────────
def can_edit_worklog(current_user: User, log: WorkLog) -> bool:
    if current_user.role == "superadmin":
        return True
    if current_user.role == "team_manager" and log.user.team_id == current_user.team_id:
        return True
    age_days = (date.today() - log.log_date).days
    return current_user.id == log.user_id and age_days <= 3


def can_delete_worklog(current_user: User, log: WorkLog) -> bool:
    return can_edit_worklog(current_user, log)


# ─── Kanban ───────────────────────────────────────────────────────────────
def can_edit_task(current_user: User, task: Task) -> bool:
    if current_user.role == "superadmin":
        return True
    if current_user.id == task.assignee_id or current_user.id == task.created_by:
        return True
    if current_user.role == "team_manager":
        # Manager can edit tasks of their team members
        assignee = task.assignee
        if assignee and assignee.team_id == current_user.team_id:
            return True
    return False


def can_delete_task(current_user: User, task: Task) -> bool:
    return can_edit_task(current_user, task)
