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


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Write audit entries for successful mutating operations as a fire-and-forget background task."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        path = request.url.path
        if (
            request.method in AUDITED_METHODS
            and response.status_code < 400
            and not any(path.startswith(p) for p in EXCLUDED_PREFIXES)
        ):
            user_id = _extract_user_id(request)
            action = _method_to_action(request.method)
            table_name, record_id = _parse_path(path)
            ip = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")

            asyncio.ensure_future(
                _write_audit(user_id, action, table_name, record_id, ip, user_agent)
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


async def _write_audit(
    user_id: Optional[str],
    action: str,
    table_name: str,
    record_id: str,
    ip: Optional[str],
    user_agent: Optional[str],
) -> None:
    try:
        from app.database import AsyncSessionLocal
        from app.models.audit_log import AuditLog

        uid = uuid.UUID(user_id) if user_id else None
        async with AsyncSessionLocal() as db:
            db.add(AuditLog(
                user_id=uid,
                action=action,
                table_name=table_name,
                record_id=record_id or "",
                ip_address=ip,
                user_agent=user_agent,
            ))
            await db.commit()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Audit log write failed (non-critical): %s", exc, exc_info=False
        )
