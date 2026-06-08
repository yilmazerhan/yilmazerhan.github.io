"""
Celery tasks for periodic background jobs (backup, inventory email).

Previously these ran via APScheduler embedded in the FastAPI lifespan, which
caused every job to fire once per uvicorn worker (--workers N → N executions).
Moving them to Celery Beat ensures a single dedicated scheduler process fires
each task exactly once per interval.

Each async task creates a FRESH SQLAlchemy engine with NullPool so that asyncpg
connections are never shared across asyncio.run() invocations. Each call to
asyncio.run() creates a new event loop; reusing pooled connections from the
previous loop causes asyncpg transport errors that silently kill the task.
NullPool opens and closes one connection per session, completely avoiding the
cross-loop pool problem.
"""
import asyncio
import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _make_engine():
    """Create a fresh async engine with NullPool for use inside asyncio.run()."""
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool
    from app.config import settings
    return create_async_engine(settings.DATABASE_URL, poolclass=NullPool)


@celery_app.task(name="app.tasks.scheduled_tasks.run_backup_check")
def run_backup_check():
    asyncio.run(_run_backup_check_async())


async def _run_backup_check_async():
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.services.backup_service import run_scheduled_backup_check

    engine = _make_engine()
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with SessionLocal.begin() as db:
            await run_scheduled_backup_check(db)
    except Exception as exc:
        logger.error("Scheduled backup check failed: %s", exc, exc_info=True)
        # Persist a "failed" record in a fresh session so it's visible in the UI.
        # The outer transaction was rolled back on exception, so we need a new session.
        await _save_failed_backup_record(SessionLocal, error_msg=str(exc))
        raise
    finally:
        await engine.dispose()


async def _save_failed_backup_record(SessionLocal, error_msg: str = "") -> None:
    from datetime import datetime, timezone
    from app.models.backup_record import BackupRecord
    ts = datetime.now(timezone.utc)
    try:
        async with SessionLocal.begin() as db:
            notes = "Zamanlanmış yedekleme başarısız oldu."
            if error_msg:
                notes += f" Hata: {error_msg[:400]}"
            db.add(BackupRecord(
                filename=f"failed_{ts.strftime('%Y%m%d_%H%M%S')}.sql",
                display_name=f"backup_{ts.strftime('%Y-%m-%d %H:%M')} (scheduled)",
                file_size=0,
                backup_type="scheduled",
                status="failed",
                notes=notes,
            ))
    except Exception as save_exc:
        logger.warning("Could not save failed backup record: %s", save_exc)


@celery_app.task(name="app.tasks.scheduled_tasks.run_inventory_email_check")
def run_inventory_email_check():
    asyncio.run(_run_inventory_email_check_async())


async def _run_inventory_email_check_async():
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.services.inventory_service import run_due_inventory_schedules

    engine = _make_engine()
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with SessionLocal.begin() as db:
            await run_due_inventory_schedules(db)
    except Exception as exc:
        logger.error("Inventory email schedule check failed: %s", exc, exc_info=True)
        raise
    finally:
        await engine.dispose()
