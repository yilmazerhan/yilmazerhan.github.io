"""Unit tests for the MCP interface: OAuth helpers, the tool catalog and the
JSON-RPC handler. The full OAuth + tool flow against a running server is
exercised end-to-end with the official MCP client (see docs/MCP.md)."""
import json
import re
import uuid
from types import SimpleNamespace

import pytest

from app.main import app
from app.mcp import tools as mcp_tools
from app.routers import mcp as mcp_router
from app.services.oauth_service import (
    OAuthError, _pkce_s256, redirect_uri_matches, validate_redirect_uri,
)


# ─── Redirect URIs ────────────────────────────────────────────────────────

@pytest.mark.parametrize("uri", [
    "http://localhost:33418/callback",
    "http://127.0.0.1:5000/cb",
    "http://[::1]:8080/cb",
    "https://vscode.dev/redirect",
    "cursor://anysphere.cursor-mcp/oauth/callback",
])
def test_redirect_uri_accepted(uri):
    validate_redirect_uri(uri)


@pytest.mark.parametrize("uri", [
    "http://evil.example/cb",          # plain http off loopback
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
    "https://ok.example/cb#frag",       # fragments are not allowed
    "relative/path",
    "",
])
def test_redirect_uri_rejected(uri):
    with pytest.raises(OAuthError):
        validate_redirect_uri(uri)


def test_loopback_redirect_may_change_port_only():
    registered = ["http://localhost:33418/callback"]
    assert redirect_uri_matches(registered, "http://localhost:33418/callback")
    assert redirect_uri_matches(registered, "http://localhost:51234/callback")
    assert not redirect_uri_matches(registered, "http://localhost:51234/other")
    assert not redirect_uri_matches(registered, "http://127.0.0.1:33418/callback")
    assert not redirect_uri_matches(["https://app.example/cb"], "https://app.example:444/cb")


def test_pkce_s256_format():
    # S256 = BASE64URL(SHA256(verifier)) without padding: always 43 chars.
    a = _pkce_s256("a" * 43)
    b = _pkce_s256("b" * 43)
    assert re.fullmatch(r"[A-Za-z0-9_\-]{43}", a)
    assert a != b and a == _pkce_s256("a" * 43)


# ─── Tool catalog ─────────────────────────────────────────────────────────

def _excluded_operations():
    spec = app.openapi()
    for full_path, item in spec["paths"].items():
        if not full_path.startswith("/api/v1/"):
            continue
        path = full_path[len("/api/v1"):]
        for method, op in item.items():
            if mcp_tools._is_excluded(method.upper(), path, op):
                yield method.upper(), path


def test_sensitive_operations_are_excluded():
    excluded = set(_excluded_operations())
    for op in [
        ("POST", "/auth/login"),
        ("POST", "/users/me/change-password"),
        ("POST", "/users/{user_id}/set-password"),
        ("POST", "/inventory/items/{item_id}/reveal"),
        ("POST", "/backup/{backup_id}/restore"),
        ("POST", "/admin/ssl/upload-pem"),
    ]:
        assert op in excluded, op
    assert ("GET", "/auth/me") not in excluded


def test_excluded_operations_unreachable_through_api_request():
    """No concrete path of an excluded operation may match an allowed template."""
    cat = mcp_tools.catalog()
    for method, path in _excluded_operations():
        concrete = re.sub(r"\{[^/]+\}", str(uuid.uuid4()), path)
        assert cat.match(method, concrete) is None, (method, path)


@pytest.mark.parametrize("path", [
    "/inventory/items/abc%2Freveal",
    "/inventory/items/../items/x/reveal",
    "/inventory/items/a.b",
])
def test_path_values_cannot_smuggle_segments(path):
    assert mcp_tools.catalog().match("POST", path) is None


def test_tool_schemas_are_self_consistent():
    defs = mcp_tools.list_tool_definitions()
    names = [d["name"] for d in defs]
    assert len(names) == len(set(names))
    assert len(defs) == len(mcp_tools.CURATED) + 4  # + whoami + 3 generic tools
    for d in defs:
        schema = d["inputSchema"]
        assert schema["type"] == "object"
        missing = [r for r in schema.get("required", []) if r not in schema["properties"]]
        assert not missing, (d["name"], missing)
        for ref in re.findall(r'"#/\$defs/([^"]+)"', json.dumps(schema)):
            assert ref in schema.get("$defs", {}), (d["name"], ref)


def test_body_field_named_title_is_kept():
    # Regression: the schema converter used to drop every key called "title".
    tools = {t["name"]: t for t in mcp_tools.list_tool_definitions()}
    assert "title" in tools["create_task"]["inputSchema"]["properties"]
    assert "title" in tools["create_task"]["inputSchema"]["required"]


def test_fill_path_rejects_malformed_ids():
    op = mcp_tools.catalog().get("GET", "/kanban/tasks/{task_id}")
    assert mcp_tools._fill_path(op.path, op.path_params, {"task_id": "abc-123"}) == "/kanban/tasks/abc-123"
    for bad in ["../users", "a/b", "a%2Fb", None]:
        with pytest.raises(mcp_tools.ToolError):
            mcp_tools._fill_path(op.path, op.path_params, {"task_id": bad})


# ─── JSON-RPC handler ─────────────────────────────────────────────────────

CTX = SimpleNamespace()  # no tool is executed in these tests


async def test_initialize_negotiates_protocol_version():
    r = await mcp_router._handle(CTX, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                                      "params": {"protocolVersion": "2025-06-18"}})
    assert r["result"]["protocolVersion"] == "2025-06-18"
    assert r["result"]["capabilities"] == {"tools": {"listChanged": False}}
    r = await mcp_router._handle(CTX, {"jsonrpc": "2.0", "id": 2, "method": "initialize",
                                      "params": {"protocolVersion": "1999-01-01"}})
    assert r["result"]["protocolVersion"] == mcp_router.SUPPORTED_PROTOCOL_VERSIONS[0]


async def test_notifications_get_no_reply():
    assert await mcp_router._handle(CTX, {"jsonrpc": "2.0", "method": "notifications/initialized"}) is None


@pytest.mark.parametrize("msg,code", [
    ({"jsonrpc": "1.0", "id": 1, "method": "ping"}, -32600),
    ("not an object", -32600),
    ({"jsonrpc": "2.0", "id": 1, "method": "resources/list"}, -32601),
    ({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "no_such_tool"}}, -32602),
    ({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": []}, -32602),
])
async def test_jsonrpc_errors(msg, code):
    r = await mcp_router._handle(CTX, msg)
    assert r["error"]["code"] == code


async def test_tools_list():
    r = await mcp_router._handle(CTX, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    names = {t["name"] for t in r["result"]["tools"]}
    assert {"whoami", "list_tasks", "create_worklog", "api_request"} <= names


async def test_unauthenticated_get_points_to_login_metadata():
    from httpx import ASGITransport, AsyncClient
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://proddy.example") as c:
        r = await c.get("/api/v1/mcp")
        assert r.status_code == 401
        assert 'resource_metadata="https://proddy.example/.well-known/oauth-protected-resource/api/v1/mcp"' \
            in r.headers["www-authenticate"]
        r = await c.get("/api/v1/mcp", headers={"Authorization": "Bearer x"})
        assert r.status_code == 405
