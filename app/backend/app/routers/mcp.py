"""MCP server endpoint (Streamable HTTP transport, stateless, JSON responses).

Each POST carries one JSON-RPC message (or a batch, for 2025-03-26 clients) and
gets a JSON reply — no SSE stream and no session id, since every request is
authenticated and self-contained. Tool execution lives in app.mcp.tools.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.core.rate_limit import limiter, _get_real_ip
from app.mcp import tools as mcp_tools
from app.routers.oauth import MCP_PATH, mcp_resource_url, public_base_url

logger = logging.getLogger(__name__)

router = APIRouter(include_in_schema=False)

SUPPORTED_PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
SERVER_INFO = {"name": "teamapp", "title": "Ekip İş Akışı Yönetimi", "version": "1.0.0"}
INSTRUCTIONS = (
    "Tools of a team work-management app (work logs, kanban tasks, leave requests, team tasks, "
    "IT inventory, customer patches, releases). Every call runs as the logged-in user, with "
    "exactly the permissions that user has in the web app; a 403 means the user isn't allowed "
    "to do it. Error messages from the app are in Turkish. Dates are YYYY-MM-DD and ids are "
    "UUIDs — look ids up with the list_* tools instead of guessing. Call whoami to see the "
    "user's role and permissions. For anything the dedicated tools don't cover, use "
    "api_list_operations, api_describe_operation and api_request."
)

MAX_BODY_BYTES = 1_000_000
MAX_BATCH = 10  # batches were dropped from the spec in 2025-06-18; kept small for older clients

PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR = (
    -32700, -32600, -32601, -32602, -32603,
)


def _unauthorized(request: Request, error: Optional[str] = None) -> Response:
    metadata = public_base_url(request) + "/.well-known/oauth-protected-resource" + MCP_PATH
    challenge = f'Bearer resource_metadata="{metadata}"'
    if error:
        challenge += f', error="{error}"'
    return JSONResponse(
        status_code=401,
        content={"error": error or "unauthorized", "error_description": "Geçerli bir MCP erişim token'ı gerekli."},
        headers={"WWW-Authenticate": challenge},
    )


def _rpc_error(msg_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def _rpc_result(msg_id: Any, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


@router.get(MCP_PATH)
@router.delete(MCP_PATH)
async def mcp_not_allowed(request: Request):
    # Clients probe with an unauthenticated GET to discover the login metadata,
    # so authentication is checked before the method.
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return _unauthorized(request)
    # No server-initiated SSE stream and no sessions to terminate.
    return Response(status_code=405, headers={"Allow": "POST"})


@router.post(MCP_PATH)
@limiter.limit("300/minute")
async def mcp_endpoint(request: Request):
    # DNS-rebinding protection: browsers send Origin; it must be our own origin.
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != public_base_url(request):
        return JSONResponse(status_code=403, content={"error": "Origin izinli değil."})

    version = request.headers.get("mcp-protocol-version")
    if version and version not in SUPPORTED_PROTOCOL_VERSIONS:
        return JSONResponse(status_code=400, content={"error": f"Desteklenmeyen MCP-Protocol-Version: {version}"})

    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return _unauthorized(request)
    ctx = await _authenticate(request, auth[7:].strip())
    if ctx is None:
        return _unauthorized(request, "invalid_token")

    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content=_rpc_error(None, INVALID_REQUEST, "Request too large"))
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError):
        return JSONResponse(content=_rpc_error(None, PARSE_ERROR, "Parse error"))

    if isinstance(payload, list):
        if not payload or len(payload) > MAX_BATCH:
            return JSONResponse(content=_rpc_error(None, INVALID_REQUEST, f"Batch must have 1-{MAX_BATCH} messages"))
        replies = [r for r in [await _handle(ctx, m) for m in payload] if r is not None]
        return JSONResponse(content=replies) if replies else Response(status_code=202)
    reply = await _handle(ctx, payload)
    return JSONResponse(content=reply) if reply is not None else Response(status_code=202)


async def _authenticate(request: Request, token: str) -> Optional[mcp_tools.CallContext]:
    from app.database import AsyncSessionLocal
    from app.services.oauth_service import OAuthService

    async with AsyncSessionLocal() as db:
        verified = await OAuthService(db).verify_access_token(token, mcp_resource_url(request))
        if not verified:
            return None
        user, grant = verified
        now = datetime.now(timezone.utc)
        if not grant.last_used_at or now - grant.last_used_at > timedelta(minutes=5):
            grant.last_used_at = now
            await db.commit()
        return mcp_tools.CallContext(
            user=user,
            client_name=grant.client_name,
            base_url=public_base_url(request),
            client_ip=_get_real_ip(request),
        )


async def _handle(ctx: mcp_tools.CallContext, msg: Any) -> Optional[dict]:
    """Process one JSON-RPC message; None for notifications and responses."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
        return _rpc_error(msg.get("id") if isinstance(msg, dict) else None, INVALID_REQUEST, "Invalid Request")
    method = msg.get("method")
    if "id" not in msg or not isinstance(method, str):
        return None  # notification (e.g. notifications/initialized) or a response from the client
    msg_id = msg["id"]
    params = msg.get("params") or {}
    if not isinstance(params, dict):
        return _rpc_error(msg_id, INVALID_PARAMS, "params must be an object")

    if method == "initialize":
        requested = params.get("protocolVersion")
        return _rpc_result(msg_id, {
            "protocolVersion": requested if requested in SUPPORTED_PROTOCOL_VERSIONS else SUPPORTED_PROTOCOL_VERSIONS[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
            "instructions": INSTRUCTIONS,
        })
    if method == "ping":
        return _rpc_result(msg_id, {})
    if method == "tools/list":
        return _rpc_result(msg_id, {"tools": mcp_tools.list_tool_definitions()})
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        if not isinstance(name, str):
            return _rpc_error(msg_id, INVALID_PARAMS, "Tool name is required")
        if name not in {t["name"] for t in mcp_tools.list_tool_definitions()}:
            return _rpc_error(msg_id, INVALID_PARAMS, f"Unknown tool: {name}")
        try:
            is_error, text = await mcp_tools.run_tool(ctx, name, args)
        except mcp_tools.ToolError as e:
            is_error, text = True, str(e)
        except Exception:
            logger.exception("MCP tool %s failed", name)
            is_error, text = True, "Araç çalıştırılırken beklenmeyen bir hata oluştu."
        return _rpc_result(msg_id, {"content": [{"type": "text", "text": text}], "isError": is_error})
    return _rpc_error(msg_id, METHOD_NOT_FOUND, f"Method not found: {method}")
