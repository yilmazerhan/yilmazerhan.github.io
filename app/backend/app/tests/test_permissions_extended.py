"""
Extended permission edge-case tests.

The permission system has two layers:
1. Role defaults (ROLE_DEFAULTS in core/permissions.py) — checked via has_permission().
2. Per-user PermissionOverride rows — can grant or deny individual module+action pairs.

The `require_permission(module, action)` dependency (used in the inventory router) is
the main enforcement point for the override system.  Worklog creation and kanban edits
use custom can_* helpers that also check role defaults but are NOT wired to the
PermissionOverride table.  Therefore the override tests in this file use the inventory
endpoints where the override layer is actually enforced.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.permission import PermissionOverride
from app.tests.conftest import get_auth_headers


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def set_overrides(
    client: AsyncClient,
    superadmin_user: User,
    target_user: User,
    overrides: list[dict],
) -> None:
    """Convenience: use the API to set overrides for target_user."""
    headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
    resp = await client.put(
        f"/api/v1/permissions/users/{target_user.id}",
        headers=headers,
        json={"overrides": overrides},
    )
    assert resp.status_code == 200, f"set_overrides failed: {resp.text}"


# ─── Test class ───────────────────────────────────────────────────────────────

class TestPermissionsExtended:

    async def test_deny_override_blocks_default_permission(
        self, client: AsyncClient, superadmin_user: User, regular_user: User, db: AsyncSession
    ):
        """A deny override for inventory.view prevents a user who would normally
        have that permission from accessing the inventory list endpoint.

        Regular users have inventory.view by default (ROLE_DEFAULTS["user"]["inventory"]
        contains "view").  A deny override should revoke that access.
        """
        # Verify user can access inventory before the override
        headers_user = await get_auth_headers(client, regular_user.email, "User123!")
        before = await client.get("/api/v1/inventory/items", headers=headers_user)
        assert before.status_code == 200, (
            f"Expected 200 before deny override, got {before.status_code}: {before.text}"
        )

        # Apply deny override for inventory.view
        await set_overrides(client, superadmin_user, regular_user, [
            {"module": "inventory", "action": "view", "is_allowed": False},
        ])

        # Now the same endpoint should be 403
        after = await client.get("/api/v1/inventory/items", headers=headers_user)
        assert after.status_code == 403, (
            f"Expected 403 after deny override, got {after.status_code}: {after.text}"
        )

    async def test_grant_override_gives_non_default_permission(
        self, client: AsyncClient, superadmin_user: User, regular_user: User, db: AsyncSession
    ):
        """A grant override for inventory.create allows a user who would not normally
        have that permission to create inventory items.

        Regular users do NOT have inventory.create by default.
        """
        headers_user = await get_auth_headers(client, regular_user.email, "User123!")

        # Confirm user cannot create inventory items without the override
        before = await client.post(
            "/api/v1/inventory/items",
            headers=headers_user,
            json={
                "item_type": "server",
                "display_name": "Test Server Before Override",
                "hostname": "test-server.local",
            },
        )
        assert before.status_code == 403, (
            f"Expected 403 before grant override, got {before.status_code}: {before.text}"
        )

        # Grant inventory.create override
        await set_overrides(client, superadmin_user, regular_user, [
            {"module": "inventory", "action": "create", "is_allowed": True},
        ])

        # Now create should be allowed
        after = await client.post(
            "/api/v1/inventory/items",
            headers=headers_user,
            json={
                "item_type": "server",
                "display_name": "Test Server After Override",
                "hostname": "test-server.local",
            },
        )
        assert after.status_code == 201, (
            f"Expected 201 after grant override, got {after.status_code}: {after.text}"
        )

    async def test_superadmin_always_has_full_access(
        self, client: AsyncClient, superadmin_user: User, db: AsyncSession
    ):
        """Superadmin has full access to everything regardless of any deny overrides.

        The service validates that superadmin overrides cannot be set
        (returns 422), ensuring the full-access guarantee is preserved.
        """
        headers_admin = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        # Attempting to set deny overrides on superadmin should fail with 422
        deny_resp = await client.put(
            f"/api/v1/permissions/users/{superadmin_user.id}",
            headers=headers_admin,
            json={"overrides": [
                {"module": "inventory", "action": "delete", "is_allowed": False},
            ]},
        )
        assert deny_resp.status_code == 422, (
            f"Expected 422 when trying to override superadmin, got {deny_resp.status_code}"
        )

        # Superadmin can still access inventory (no deny took effect)
        inv_resp = await client.get("/api/v1/inventory/items", headers=headers_admin)
        assert inv_resp.status_code == 200, (
            f"Superadmin should always access inventory, got {inv_resp.status_code}"
        )

        # Superadmin can access audit logs (superadmin-only endpoint)
        audit_resp = await client.get("/api/v1/admin/audit-logs", headers=headers_admin)
        assert audit_resp.status_code == 200

        # Superadmin can list users
        users_resp = await client.get("/api/v1/users", headers=headers_admin)
        assert users_resp.status_code == 200

    async def test_permission_override_for_inventory_delete(
        self, client: AsyncClient, superadmin_user: User, regular_user: User, db: AsyncSession
    ):
        """Grant a regular user the inventory.delete permission via override.

        Regular users do not have inventory.delete by default.  After granting
        the override, they should be able to delete an inventory item created by
        the superadmin.
        """
        # Superadmin creates an inventory item to be deleted
        admin_headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        create_resp = await client.post(
            "/api/v1/inventory/items",
            headers=admin_headers,
            json={
                "item_type": "server",
                "display_name": "Item To Delete By User",
                "hostname": "delete-test.local",
            },
        )
        assert create_resp.status_code == 201, f"Item creation failed: {create_resp.text}"
        item_id = create_resp.json()["id"]

        user_headers = await get_auth_headers(client, regular_user.email, "User123!")

        # User cannot delete without the override
        before_delete = await client.delete(
            f"/api/v1/inventory/items/{item_id}",
            headers=user_headers,
        )
        assert before_delete.status_code == 403, (
            f"Expected 403 before grant override, got {before_delete.status_code}"
        )

        # Grant inventory.delete override
        await set_overrides(client, superadmin_user, regular_user, [
            {"module": "inventory", "action": "delete", "is_allowed": True},
        ])

        # Now delete should be allowed
        after_delete = await client.delete(
            f"/api/v1/inventory/items/{item_id}",
            headers=user_headers,
        )
        assert after_delete.status_code in (200, 204), (
            f"Expected 200/204 after grant override, got {after_delete.status_code}: {after_delete.text}"
        )

    async def test_effective_permissions_api_returns_correct_state(
        self, client: AsyncClient, superadmin_user: User, regular_user: User, db: AsyncSession
    ):
        """The /permissions/effective/{id} endpoint reflects both defaults and overrides.

        1. Before any override, regular user has worklog.create=True (role default).
        2. After denying worklog.create, the endpoint should show False.
        3. After granting worklog.view (already default True for 'user'), stays True.
        """
        admin_headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        def get_perms():
            return client.get(
                f"/api/v1/permissions/effective/{regular_user.id}",
                headers=admin_headers,
            )

        # --- Baseline ---
        resp = await get_perms()
        assert resp.status_code == 200
        perms = resp.json()["permissions"]
        # Role defaults: user has worklog.create = True
        assert perms["worklog"]["create"] is True
        # Role defaults: user does NOT have user_management.create
        assert perms["user_management"]["create"] is False
        # Role defaults: user does NOT have kanban.delete
        assert perms["kanban"]["delete"] is False

        # --- Apply overrides ---
        await set_overrides(client, superadmin_user, regular_user, [
            {"module": "worklog", "action": "create", "is_allowed": False},
            {"module": "user_management", "action": "view", "is_allowed": True},
        ])

        resp2 = await get_perms()
        assert resp2.status_code == 200
        perms2 = resp2.json()["permissions"]

        # Deny override applied: worklog.create should now be False
        assert perms2["worklog"]["create"] is False, (
            "Deny override for worklog.create should set it to False."
        )
        # Grant override applied: user_management.view should now be True
        assert perms2["user_management"]["view"] is True, (
            "Grant override for user_management.view should set it to True."
        )
        # Unmodified permission: kanban.delete remains False (no override set)
        assert perms2["kanban"]["delete"] is False, (
            "kanban.delete should still be False (no override was applied)."
        )

        # --- Clear overrides, back to defaults ---
        await set_overrides(client, superadmin_user, regular_user, [])

        resp3 = await get_perms()
        perms3 = resp3.json()["permissions"]
        assert perms3["worklog"]["create"] is True, (
            "After clearing overrides, worklog.create should revert to role default True."
        )
        assert perms3["user_management"]["view"] is False, (
            "After clearing overrides, user_management.view should revert to role default False."
        )
