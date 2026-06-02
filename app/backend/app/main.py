import logging
import time as _time_module
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.config import settings

_APP_START_TIME = _time_module.time()
from app.core.middleware import SecurityHeadersMiddleware, AuditLogMiddleware
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.routers import auth, users, teams, permissions, worklog, kanban, jira, email, admin, notifications
from app.routers.leave import router as leave_router
from app.routers.backup import router as backup_router
from app.routers.export import router as export_router
from app.routers.inventory import router as inventory_router
from app.routers.announcements import router as announcements_router
from app.routers.patch import router as patch_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: seed superadmin if needed
    from app.database import AsyncSessionLocal
    from app.services.seed_service import seed_initial_data
    async with AsyncSessionLocal() as db:
        await seed_initial_data(db)
    # Periodic scheduled jobs (backup, inventory email) run via Celery Beat —
    # a single dedicated process — to avoid duplicate execution across uvicorn workers.
    yield


app = FastAPI(
    title="Ekip İş Akışı Yönetim Uygulaması",
    version="1.0.0",
    docs_url="/api/docs" if settings.is_development else None,
    redoc_url="/api/redoc" if settings.is_development else None,
    openapi_url="/api/openapi.json" if settings.is_development else None,
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS
_cors_origins = [settings.FRONTEND_URL]
# Allow common local dev origins so Playwright and hot-reload work (dev only!)
if settings.ENVIRONMENT == "development":
    for _dev_origin in [
        "http://localhost:5173", "http://localhost:3000",
        "http://127.0.0.1:5173", "http://127.0.0.1:3000",
    ]:
        if _dev_origin not in _cors_origins:
            _cors_origins.append(_dev_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# Audit log (runs after security headers; fire-and-forget DB write)
app.add_middleware(AuditLogMiddleware)


# ─── Routers ──────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")
app.include_router(permissions.router, prefix="/api/v1")
app.include_router(worklog.router, prefix="/api/v1")
app.include_router(kanban.router, prefix="/api/v1")
app.include_router(jira.router, prefix="/api/v1")
app.include_router(email.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(leave_router, prefix="/api/v1")
app.include_router(backup_router, prefix="/api/v1")
app.include_router(export_router, prefix="/api/v1")
app.include_router(inventory_router, prefix="/api/v1")
app.include_router(announcements_router, prefix="/api/v1")
app.include_router(patch_router, prefix="/api/v1")


# ─── Health check ─────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}


# ─── Public branding (no auth required) ───────────────────────────────────
@app.get("/api/v1/public/branding", tags=["public"])
async def public_branding():
    from app.database import AsyncSessionLocal
    from app.services.branding_service import get_branding
    async with AsyncSessionLocal() as db:
        return await get_branding(db)
