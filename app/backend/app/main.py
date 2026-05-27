import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.middleware import SecurityHeadersMiddleware, AuditLogMiddleware
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.routers import auth, users, teams, permissions, worklog, kanban, jira, email, admin, notifications
from app.routers.leave import router as leave_router
from app.routers.backup import router as backup_router
from app.routers.export import router as export_router
from app.routers.inventory import router as inventory_router

logger = logging.getLogger(__name__)


def _start_scheduler():
    """Start APScheduler for periodic backups."""
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = AsyncIOScheduler()

        async def _run_scheduled_backup():
            """Read schedule settings and run backup if it's time."""
            from datetime import datetime as _dt
            try:
                from app.database import AsyncSessionLocal
                from app.services import backup_service
                async with AsyncSessionLocal() as db:
                    schedule = await backup_service.get_schedule(db)
                    if schedule.get("backup_enabled", "false").lower() != "true":
                        return

                    now = _dt.utcnow()
                    backup_hour = int(schedule.get("backup_hour", "2"))
                    frequency = schedule.get("backup_frequency", "daily")

                    # Only run at the configured hour
                    if now.hour != backup_hour:
                        return

                    # For weekly: only run on the configured day (0=Mon … 6=Sun)
                    if frequency == "weekly":
                        backup_dow = int(schedule.get("backup_day_of_week", "0"))
                        if now.weekday() != backup_dow:
                            return

                    # Check if a backup already ran in the last 23h to avoid duplicates
                    from app.models.backup_record import BackupRecord
                    from sqlalchemy import select
                    from datetime import timedelta
                    cutoff = now - timedelta(hours=23)
                    result = await db.execute(
                        select(BackupRecord)
                        .where(BackupRecord.backup_type == "scheduled")
                        .where(BackupRecord.created_at >= cutoff)
                    )
                    if result.scalar_one_or_none() is not None:
                        logger.debug("Scheduled backup already ran recently; skipping.")
                        return

                    logger.info("Running scheduled backup (frequency=%s hour=%d)…", frequency, backup_hour)
                    await backup_service.create_backup(db, backup_type="scheduled", notes="Otomatik zamanlı yedek")
            except Exception as exc:
                logger.error("Scheduled backup failed: %s", exc, exc_info=True)

        async def _run_inventory_email_check():
            """Check for due inventory email schedules and send them."""
            try:
                from app.database import AsyncSessionLocal
                from app.services.inventory_service import run_due_inventory_schedules
                async with AsyncSessionLocal() as db:
                    await run_due_inventory_schedules(db)
            except Exception as exc:
                logger.error("Inventory email schedule check failed: %s", exc, exc_info=True)

        # Check every hour on the hour
        scheduler.add_job(_run_scheduled_backup, CronTrigger(minute=0), id="hourly_backup_check")
        scheduler.add_job(_run_inventory_email_check, CronTrigger(minute=0), id="hourly_inventory_email_check")
        scheduler.start()
        logger.info("APScheduler started (hourly backup check job).")
        return scheduler
    except Exception as exc:
        logger.warning("Could not start APScheduler: %s", exc)
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: seed superadmin if needed
    from app.database import AsyncSessionLocal
    from app.services.seed_service import seed_initial_data
    async with AsyncSessionLocal() as db:
        await seed_initial_data(db)

    # Start periodic backup scheduler
    scheduler = _start_scheduler()
    yield
    # Shutdown
    if scheduler:
        scheduler.shutdown(wait=False)


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
