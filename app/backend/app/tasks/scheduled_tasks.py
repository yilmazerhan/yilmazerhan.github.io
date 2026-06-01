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


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.tasks.scheduled_tasks.run_backup_check")
def run_backup_check():
    _run_async(_run_backup_check_async())


async def _run_backup_check_async():
    try:
        from app.database import AsyncSessionLocal
        from app.services.backup_service import run_scheduled_backup_check
        async with AsyncSessionLocal.begin() as db:
            await run_scheduled_backup_check(db)
    except Exception as exc:
        logger.error("Scheduled backup check failed: %s", exc, exc_info=True)
        raise


@celery_app.task(name="app.tasks.scheduled_tasks.run_inventory_email_check")
def run_inventory_email_check():
    _run_async(_run_inventory_email_check_async())


async def _run_inventory_email_check_async():
    try:
        from app.database import AsyncSessionLocal
        from app.services.inventory_service import run_due_inventory_schedules
        async with AsyncSessionLocal.begin() as db:
            await run_due_inventory_schedules(db)
    except Exception as exc:
        logger.error("Inventory email schedule check failed: %s", exc, exc_info=True)
        raise
