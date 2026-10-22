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
    "https://claude.ai/api/mcp/auth_callback",
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
    # Consent phishing: arbitrary https callbacks and look-alikes are refused.
    "https://evil.example/cb",
    "https://claude.ai@evil.example/api/mcp/auth_callback",
    "http://localhost@evil.example/cb",
    "https://claude.ai.evil.example/api/mcp/auth_callback",
    "https://claude.ai:444/api/mcp/auth_callback",
    "ms-msdt:/id",
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


def test_extra_redirect_uris_setting(monkeypatch):
    from app.config import settings
    with pytest.raises(OAuthError):
        validate_redirect_uri("https://ai.internal.example/callback")
    monkeypatch.setattr(settings, "MCP_OAUTH_EXTRA_REDIRECT_URIS", "https://ai.internal.example/callback, windsurf://")
    validate_redirect_uri("https://ai.internal.example/callback")
    validate_redirect_uri("windsurf://oauth/cb")


def test_client_name_is_sanitized():
    from app.services.oauth_service import sanitize_client_name
    assert sanitize_client_name("Claude\u202eedoC\r\nX") == "ClaudeedoCX"
    assert sanitize_client_name("Türkçe İstemci") == "Türkçe İstemci"
    assert sanitize_client_name(None) == "MCP istemcisi"


def test_admin_areas_are_read_only_over_mcp():
    ops = {(o.method, o.path) for o in mcp_tools.catalog().operations}
    for op in [
        ("POST", "/users"), ("PATCH", "/users/{user_id}"),
        ("PUT", "/permissions/users/{user_id}"), ("POST", "/teams/{team_id}/members"),
        ("PATCH", "/jira/configs/{config_id}"), ("POST", "/jira/configs/{config_id}/test"),
        ("PATCH", "/email/smtp/{config_id}"), ("POST", "/email/smtp/{config_id}/test"),
        ("PATCH", "/email/templates/{template_id}"), ("POST", "/email/workflows"),
        ("POST", "/admin/reports/schedules"), ("POST", "/inventory/schedules"),
    ]:
        assert op not in ops, op
    for op in [("GET", "/users"), ("PATCH", "/users/me/profile"), ("GET", "/email/workflows"),
               ("POST", "/worklogs"), ("PATCH", "/kanban/tasks/{task_id}")]:
        assert op in ops, op


async def test_non_ascii_client_name_does_not_break_tool_calls(monkeypatch):
    # Regression: a Turkish client name used to crash every call (non-ASCII header).
    captured = {}

    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def request(self, method, url, params=None, headers=None, json=None):
            captured.update(headers)
            import httpx
            return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(mcp_tools.httpx, "AsyncClient", FakeClient)
    ctx = mcp_tools.CallContext(user=SimpleNamespace(id=uuid.uuid4(), role="user"),
                                client_name="Çalışma İstemcisi\r\nX-Evil: 1",
                                base_url="https://h", client_ip="127.0.0.1")
    is_error, _ = await mcp_tools.call_api(ctx, "GET", "/auth/me")
    assert not is_error
    ua = captured["User-Agent"]
    assert ua.isascii() and "\r" not in ua and "\n" not in ua


async def test_mcp_rejects_oversized_batches():
    from httpx import ASGITransport, AsyncClient
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://h") as c:
        # unauthenticated requests are refused before the body is parsed
        r = await c.post("/api/v1/mcp", json=[{"jsonrpc": "2.0", "id": i, "method": "ping"} for i in range(50)])
        assert r.status_code == 401
    assert mcp_router.MAX_BATCH == 10


async def test_bad_code_verifier_is_invalid_grant_not_500():
    from app.services.oauth_service import OAuthService
    with pytest.raises(OAuthError) as e:
        await OAuthService(db=None).exchange_code("c", "cid", "http://localhost/cb", "ş" * 43, None)
    assert e.value.code == "invalid_grant"
