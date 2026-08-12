import re
import uuid
import asyncio
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
EXCLUDED_PREFIXES = (
    "/health",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/public",
)
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

# Parsed path base (segments before the first UUID, joined by "_") → SQL table
# used to snapshot the affected row for old_data/new_data. Unmapped paths fall
# back to the (redacted) response payload for new_data.
AUDIT_TABLE_MAP = {
    "users": "users",
    "teams": "teams",
    "worklogs": "work_logs",
    "worklogs_work-types": "work_types",
    "kanban_boards": "kanban_boards",
    "kanban_columns": "kanban_columns",
    "kanban_labels": "task_labels",
    "kanban_tasks": "tasks",
    "patches": "customer_patches",
    "patches_customers": "customers",
    "announcements": "announcements",
    "leaves": "leave_requests",
    "inventory_items": "inventory_items",
    "inventory_groups": "inventory_groups",
    "inventory_schedules": "inventory_email_schedules",
    "email_smtp": "smtp_configs",
    "email_templates": "email_templates",
    "email_workflows": "email_workflows",
    "email_teams-webhooks": "teams_webhook_configs",
    "jira_configs": "jira_configs",
    "admin_reports_schedules": "report_schedules",
    "notifications": "notifications",
    "backup": "backup_records",
}

# Never store secret values in audit data.
# `_encrypted` catches ssh_key_encrypted / access_key_id_encrypted (and any future
# *_encrypted column) — otherwise their Fernet ciphertext is copied verbatim into
# audit_logs, which is never pruned and is not covered by key rotation, so retired
# keys stay useful to anyone holding an old pg_dump.
_SENSITIVE_KEY_RE = re.compile(
    r"password|token|secret|api_key|webhook_url|_pem|_encrypted|^value$", re.I
)

# Don't try to parse/store unreasonably large payloads.
_MAX_AUDIT_BODY = 100_000


class DBSessionMiddleware(BaseHTTPMiddleware):
    """Request-scoped DB session that commits BEFORE the response is sent.

    FastAPI runs `yield`-dependency teardown *after* the response has been
    dispatched, so committing in get_db's teardown lets the client observe a
    success response before the data is durably committed — an immediate
    read-after-write (e.g. a list refetch right after a create) can miss the
    new row. Owning the session here and committing after the endpoint returns
    but before the response leaves this middleware closes that race.

    The session is created lazily (only when a route actually uses get_db) and
    shared with the route via request.state (backed by the ASGI scope).
    """

    async def dispatch(self, request: Request, call_next):
        request.state.db = None
        try:
            response = await call_next(request)
        except Exception:
            db = getattr(request.state, "db", None)
            if db is not None:
                await db.rollback()
                await db.close()
            raise
        db = getattr(request.state, "db", None)
        if db is not None:
            try:
                if response.status_code < 400:
                    await db.commit()
                else:
                    await db.rollback()
            finally:
                await db.close()
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        # Content-Security-Policy: restrict resource loading to same origin;
        # data: URIs allowed for img-src (company logo stored as data URI);
        # style-src 'unsafe-inline' needed for Tailwind/CSS-in-JS runtimes.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
        # Set HSTS in production unconditionally (backend may be behind nginx terminating TLS)
        from app.config import settings as _settings
        if _settings.ENVIRONMENT == "production" or request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        return response


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Write audit entries for successful mutating operations as a fire-and-forget background task."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        # Use the raw ASGI path — the same value routing itself dispatches on.
        # request.url is rebuilt from the client-supplied Host header, so it can
        # be made to disagree with the routed path (CVE-2026-48710); a request
        # whose reconstructed path started with an EXCLUDED_PREFIX would execute
        # its mutation with no audit row and no before-snapshot.
        path = request.scope.get("path") or request.url.path
        audited = request.method in AUDITED_METHODS and not any(
            path.startswith(p) for p in EXCLUDED_PREFIXES
        )

        old_data = None
        table_name = record_id = ""
        snapshot_table = None
        if audited:
            table_name, record_id = _parse_path(path)
            snapshot_table = _snapshot_table_for(path)
            # Snapshot the row BEFORE the route mutates/deletes it.
            if snapshot_table and record_id and request.method in ("PUT", "PATCH", "DELETE"):
                old_data = await _fetch_snapshot(snapshot_table, record_id)

        response = await call_next(request)

        if audited and response.status_code < 400:
            payload = None
            if request.method != "DELETE" and hasattr(response, "body_iterator"):
                # Buffer the response body so we can read the created/updated
                # entity (and its id for creates), then rebuild the response.
                body = b""
                async for chunk in response.body_iterator:
                    body += chunk
                rebuilt = Response(
                    content=body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                )
                rebuilt.background = response.background
                response = rebuilt
                payload = _parse_json_dict(body)
                if not record_id and payload:
                    rid = payload.get("id")
                    if isinstance(rid, str) and _UUID_RE.match(rid):
                        record_id = rid

            user_id = _extract_user_id(request)
            action = _method_to_action(request.method)
            from app.core.rate_limit import _get_real_ip
            ip = _get_real_ip(request)
            user_agent = request.headers.get("user-agent")

            asyncio.ensure_future(
                _write_audit(
                    user_id, action, table_name, record_id, ip, user_agent,
                    old_data=old_data,
                    payload=_redact(payload) if payload else None,
                    snapshot_table=snapshot_table,
                )
            )

        return response


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_user_id(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        from app.core.security import decode_access_token
        payload = decode_access_token(auth[7:])
        return payload.get("sub")
    except Exception:
        return None


def _method_to_action(method: str) -> str:
    if method == "POST":
        return "create"
    if method == "DELETE":
        return "delete"
    return "update"


def _parse_path(path: str) -> tuple[str, str]:
    """
    /api/v1/kanban/tasks/uuid → ("kanban_tasks", "uuid")
    /api/v1/users           → ("users", "")
    """
    parts = [p for p in path.split("/") if p and p not in ("api", "v1")]
    record_id = ""
    name_parts = []
    for part in parts:
        if _UUID_RE.match(part):
            record_id = part
        else:
            name_parts.append(part)
    return "_".join(name_parts) if name_parts else path, record_id


def _snapshot_table_for(path: str) -> Optional[str]:
    """Map the path segments before the first UUID to a DB table name."""
    parts = [p for p in path.split("/") if p and p not in ("api", "v1")]
    base = []
    for part in parts:
        if _UUID_RE.match(part):
            break
        base.append(part)
    return AUDIT_TABLE_MAP.get("_".join(base))


def _parse_json_dict(body: bytes) -> Optional[dict]:
    if not body or len(body) > _MAX_AUDIT_BODY:
        return None
    try:
        import json
        data = json.loads(body)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _redact(obj):
    """Replace values of secret-looking keys with *** (recursively)."""
    if isinstance(obj, dict):
        return {
            k: ("***" if _SENSITIVE_KEY_RE.search(k) and v is not None else _redact(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact(x) for x in obj]
    return obj


async def _fetch_snapshot(table: str, record_id: str) -> Optional[dict]:
    """Read a row as JSON from a whitelisted table (committed state)."""
    if table not in AUDIT_TABLE_MAP.values() or not _UUID_RE.match(record_id):
        return None
    try:
        from sqlalchemy import text
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            res = await db.execute(
                text(f'SELECT to_jsonb(t) FROM "{table}" t WHERE id = CAST(:rid AS uuid)'),
                {"rid": record_id},
            )
            row = res.scalar_one_or_none()
            return _redact(row) if isinstance(row, dict) else None
    except Exception:
        return None


async def _write_audit(
    user_id: Optional[str],
    action: str,
    table_name: str,
    record_id: str,
    ip: Optional[str],
    user_agent: Optional[str],
    old_data: Optional[dict] = None,
    payload: Optional[dict] = None,
    snapshot_table: Optional[str] = None,
) -> None:
    try:
        from app.database import AsyncSessionLocal
        from app.models.audit_log import AuditLog

        new_data = None
        if action in ("create", "update"):
            # Prefer a fresh DB snapshot (same key space as old_data, so the
            # update diff is clean); fall back to the response payload.
            if snapshot_table and record_id:
                new_data = await _fetch_snapshot(snapshot_table, record_id)
            if new_data is None:
                new_data = payload

        uid = uuid.UUID(user_id) if user_id else None
        async with AsyncSessionLocal() as db:
            db.add(AuditLog(
                user_id=uid,
                action=action,
                table_name=table_name,
                record_id=record_id or "",
                old_data=old_data,
                new_data=new_data,
                ip_address=ip,
                user_agent=user_agent,
            ))
            await db.commit()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Audit log write failed (non-critical): %s", exc, exc_info=False
        )
