"""
Celery tasks for periodic background jobs (backup, inventory email).

Previously these ran via APScheduler embedded in the FastAPI lifespan, which
caused every job to fire once per uvicorn worker (--workers N → N executions).
Moving them to Celery Beat ensures a single dedicated scheduler process fires
each task exactly once per interval.
"""
import asyncio
import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.scheduled_tasks.run_backup_check")
def run_backup_check():
    asyncio.run(_run_backup_check_async())


async def _run_backup_check_async():
    from app.database import engine, AsyncSessionLocal
    from app.services.backup_service import run_scheduled_backup_check
    # Discard any pool connections tied to the previous event loop (Celery reuses
    # worker processes across tasks; each asyncio.run() call creates a fresh loop,
    # so pooled asyncpg connections from the last run are unusable in the new loop).
    await engine.dispose()
    try:
        async with AsyncSessionLocal.begin() as db:
            await run_scheduled_backup_check(db)
    except Exception as exc:
        logger.error("Scheduled backup check failed: %s", exc, exc_info=True)
        # Persist a "failed" record in a fresh session so it's visible in the UI.
        # The outer transaction was rolled back on exception, so we need a new session.
        await _save_failed_backup_record(AsyncSessionLocal)
        raise


async def _save_failed_backup_record(AsyncSessionLocal) -> None:
    from datetime import datetime, timezone
    from app.models.backup_record import BackupRecord
    ts = datetime.now(timezone.utc)
    try:
        async with AsyncSessionLocal.begin() as db:
            db.add(BackupRecord(
                filename=f"failed_{ts.strftime('%Y%m%d_%H%M%S')}.sql",
                display_name=f"backup_{ts.strftime('%Y-%m-%d %H:%M')} (scheduled)",
                file_size=0,
                backup_type="scheduled",
                status="failed",
                notes="Zamanlanmış yedekleme başarısız oldu.",
            ))
    except Exception as save_exc:
        logger.warning("Could not save failed backup record: %s", save_exc)


@celery_app.task(name="app.tasks.scheduled_tasks.run_inventory_email_check")
def run_inventory_email_check():
    asyncio.run(_run_inventory_email_check_async())


async def _run_inventory_email_check_async():
    from app.database import engine, AsyncSessionLocal
    from app.services.inventory_service import run_due_inventory_schedules
    # Same cross-loop pool-cleanup as in _run_backup_check_async (see comment above).
    await engine.dispose()
    try:
        async with AsyncSessionLocal.begin() as db:
            await run_due_inventory_schedules(db)
    except Exception as exc:
        logger.error("Inventory email schedule check failed: %s", exc, exc_info=True)
        raise
