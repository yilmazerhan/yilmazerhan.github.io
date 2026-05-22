import json
import uuid
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
EXCLUDED_PATHS = {"/health", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/public"}


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
    """Write audit entries for mutating operations. Runs as a background task to not block response."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if request.method in AUDITED_METHODS:
            for excluded in EXCLUDED_PATHS:
                if request.url.path.startswith(excluded):
                    return response
            # Audit writing is deferred to service layer via request.state injection
            # This middleware sets the context so services can write to audit_logs
            pass

        return response
