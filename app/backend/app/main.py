import asyncio
import logging
import time as _time_module
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.config import settings

_APP_START_TIME = _time_module.time()
from app.core.middleware import SecurityHeadersMiddleware, AuditLogMiddleware, DBSessionMiddleware
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.routers import auth, users, teams, permissions, worklog, kanban, jira, email, admin, notifications
from app.routers.leave import router as leave_router
from app.routers.backup import router as backup_router
from app.routers.export import router as export_router
from app.routers.inventory import router as inventory_router
from app.routers.announcements import router as announcements_router
from app.routers.patch import router as patch_router

logger = logging.getLogger(__name__)


# Distinct advisory-lock keys so only one process performs each scheduled job
# per tick, even when uvicorn runs multiple workers and Celery Beat is also active.
_BACKUP_LOCK_KEY = 943_100_001
_EMAIL_LOCK_KEY = 943_100_002


async def _try_advisory_lock(db, key: int) -> bool:
    """Acquire a transaction-scoped Postgres advisory lock; False if held elsewhere."""
    from sqlalchemy import text
    got = await db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": key})
    return bool(got.scalar())


async def _backup_scheduler_loop() -> None:
    """In-process backup scheduler — runs every 60 s as a fallback when Celery Beat is not running.

    Also updates the backup_celery_heartbeat so the UI heartbeat indicator turns green
    even when the Celery container is absent.  A Postgres advisory lock ensures only one
    worker/process performs the check per tick so multiple uvicorn workers (or Celery Beat
    running concurrently) cannot create duplicate backups.
    """
    await asyncio.sleep(30)  # brief startup delay
    while True:
        try:
            from app.database import AsyncSessionLocal
            from app.services.backup_service import run_scheduled_backup_check, update_heartbeat
            async with AsyncSessionLocal() as db:
                await update_heartbeat(db)
                await db.commit()
            async with AsyncSessionLocal() as db:
                if await _try_advisory_lock(db, _BACKUP_LOCK_KEY):
                    await run_scheduled_backup_check(db)
                    await db.commit()
        except Exception as exc:
            logger.warning("In-process backup scheduler: %s", exc)
        await asyncio.sleep(60)


async def _email_scheduler_loop() -> None:
    """In-process email workflow evaluator — runs every 15 min as a fallback.

    Keeps the email Celery heartbeat fresh and evaluates scheduled workflows.
    Actual SMTP delivery is dispatched to Celery if available; if Celery is
    not running the dispatch call will raise a broker error that is caught
    per-workflow so other workflows still execute.
    """
    await asyncio.sleep(90)  # offset from backup loop startup
    while True:
        try:
            from app.database import AsyncSessionLocal
            from app.tasks.email_tasks import _evaluate_workflows_async
            run_eval = False
            async with AsyncSessionLocal() as db:
                run_eval = await _try_advisory_lock(db, _EMAIL_LOCK_KEY)
                if run_eval:
                    await _evaluate_workflows_async()
        except Exception as exc:
            logger.warning("In-process email scheduler: %s", exc)
        await asyncio.sleep(900)  # 15 minutes


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: seed superadmin if needed
    from app.database import AsyncSessionLocal
    from app.services.seed_service import seed_initial_data
    async with AsyncSessionLocal() as db:
        await seed_initial_data(db)

    # Start in-process scheduler loops. These complement Celery Beat: if Celery
    # containers are not running, scheduled backups and workflow evaluations still
    # happen. If Celery IS running, the dedup/heartbeat logic is idempotent.
    _tasks = [
        asyncio.create_task(_backup_scheduler_loop()),
        asyncio.create_task(_email_scheduler_loop()),
    ]
    yield
    for t in _tasks:
        t.cancel()
    await asyncio.gather(*_tasks, return_exceptions=True)


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

# Request-scoped DB session: request.state.db is available throughout the
# request, and the commit runs before the response is dispatched (fixes
# read-after-write race).
app.add_middleware(DBSessionMiddleware)

# Audit log (fire-and-forget DB write). Added after (= outside) the DB session
# middleware so the route's transaction is already committed when the audit
# task snapshots the new row state for new_data.
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
