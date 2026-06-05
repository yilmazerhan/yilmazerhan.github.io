"""
Backup service: create pg_dump snapshots, store metadata, restore, and prune old backups.
"""
import logging
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

_ISTANBUL = ZoneInfo("Europe/Istanbul")

from fastapi import HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.backup_record import BackupRecord

logger = logging.getLogger(__name__)

BACKUP_DIR = "/app/backups"
_BACKUP_TYPE_MANUAL = "manual"
_BACKUP_TYPE_SCHEDULED = "scheduled"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_db_url():
    raw = settings.DATABASE_URL.replace("+asyncpg", "")
    p = urlparse(raw)
    return {
        "host": p.hostname or "localhost",
        "port": str(p.port or 5432),
        "user": p.username or "postgres",
        "password": p.password or "",
        "dbname": (p.path or "").lstrip("/"),
    }


def _pg_env():
    conn = _parse_db_url()
    env = dict(os.environ)
    env["PGPASSWORD"] = conn["password"]
    return env, conn


async def _run(cmd: list[str], env: dict, stdin: bytes | None = None) -> tuple[bytes, bytes, int]:
    import asyncio
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE if stdin is not None else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, stderr = await proc.communicate(input=stdin)
    return stdout, stderr, proc.returncode


def _ensure_backup_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)


def _safe_filename(record_id: str, display_name: str) -> str:
    """Build a stable, injection-safe on-disk filename."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"backup_{ts}_{record_id[:8]}.sql"


def _file_path(filename: str) -> str:
    """Resolve and guard against path traversal."""
    base = os.path.realpath(BACKUP_DIR)
    full = os.path.realpath(os.path.join(base, filename))
    if not full.startswith(base + os.sep):
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")
    return full


# ── Public API ────────────────────────────────────────────────────────────────

async def create_backup(
    db: AsyncSession,
    backup_type: str = _BACKUP_TYPE_MANUAL,
    notes: str | None = None,
) -> BackupRecord:
    """Run pg_dump, persist the file, and write a BackupRecord."""
    _ensure_backup_dir()
    env, conn = _pg_env()

    record_id = str(uuid.uuid4())
    filename = _safe_filename(record_id, backup_type)
    file_path = os.path.join(BACKUP_DIR, filename)
    display_name = f"backup_{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} ({backup_type})"

    # pg_dump with --clean --if-exists so the .sql is self-contained for restore
    cmd = [
        "pg_dump",
        "-h", conn["host"], "-p", conn["port"], "-U", conn["user"], "-d", conn["dbname"],
        "--no-password", "--format=plain", "--no-owner", "--no-privileges",
        "--clean", "--if-exists",
    ]

    try:
        stdout, stderr, rc = await _run(cmd, env)
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="pg_dump binary not found in this environment.")

    if rc != 0:
        logger.error("pg_dump failed (rc=%d) — details omitted for security", rc)
        raise HTTPException(status_code=500, detail="Veritabanı yedeği alınamadı.")

    # Write to disk
    with open(file_path, "wb") as f:
        f.write(stdout)

    file_size = len(stdout)

    record = BackupRecord(
        filename=filename,
        display_name=display_name,
        file_size=file_size,
        backup_type=backup_type,
        status="completed",
        notes=notes,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    # Prune old backups (keep last N per type or overall)
    await _prune_old_backups(db)

    logger.info("Backup created: %s (%.1f KB)", filename, file_size / 1024)
    return record


async def list_backups(db: AsyncSession) -> list[BackupRecord]:
    result = await db.execute(
        select(BackupRecord).order_by(BackupRecord.created_at.desc())
    )
    records = list(result.scalars().all())
    # Annotate with exists-on-disk status
    for r in records:
        try:
            fp = _file_path(r.filename)
            r._file_exists = os.path.exists(fp)  # type: ignore[attr-defined]
        except Exception:
            r._file_exists = False  # type: ignore[attr-defined]
    return records


async def get_backup_file(db: AsyncSession, backup_id: uuid.UUID) -> tuple[str, BackupRecord]:
    """Return (file_path, record). Raises 404 if not found."""
    result = await db.execute(select(BackupRecord).where(BackupRecord.id == backup_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Yedek kaydı bulunamadı.")
    fp = _file_path(record.filename)
    if not os.path.exists(fp):
        raise HTTPException(status_code=404, detail="Yedek dosyası bulunamadı (disk'te mevcut değil).")
    return fp, record


async def restore_backup(db: AsyncSession, backup_id: uuid.UUID) -> dict:
    """Restore the database from a previously stored backup using psql."""
    fp, record = await get_backup_file(db, backup_id)
    env, conn = _pg_env()

    # Snapshot the info we need before closing the session
    display_name = record.display_name
    filename = record.filename

    # Check psql binary
    import shutil
    if not shutil.which("psql"):
        raise HTTPException(status_code=501, detail="psql binary not found in this environment.")

    # Read the backup SQL file
    with open(fp, "rb") as f:
        sql_bytes = f.read()

    # IMPORTANT: Commit and close the current session BEFORE running psql.
    # The pg_dump backup contains ALTER TABLE / DROP CONSTRAINT statements that
    # require exclusive locks. If our session stays open in a transaction it
    # will deadlock with those lock requests.
    await db.flush()
    await db.close()

    cmd = [
        "psql",
        "-h", conn["host"], "-p", conn["port"],
        "-U", conn["user"], "-d", conn["dbname"],
        "--no-password",
        "-v", "ON_ERROR_STOP=1",   # stop on first error
        "--single-transaction",     # atomic: all-or-nothing
    ]

    stdout, stderr, rc = await _run(cmd, env, stdin=sql_bytes)

    if rc != 0:
        err_preview = stderr.decode("utf-8", errors="replace")[:400]
        logger.error("psql restore failed (rc=%d): %s", rc, err_preview)
        raise HTTPException(
            status_code=500,
            detail="Restore başarısız oldu. Veritabanı değiştirilmedi (transaction rollback).",
        )

    logger.info("Database restored from backup: %s", filename)
    return {
        "message": f"'{display_name}' yedeğinden başarıyla geri yüklendi.",
        "backup_id": str(backup_id),
        "filename": filename,
    }


async def delete_backup(db: AsyncSession, backup_id: uuid.UUID) -> None:
    result = await db.execute(select(BackupRecord).where(BackupRecord.id == backup_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Yedek kaydı bulunamadı.")

    # Delete file safely
    try:
        fp = _file_path(record.filename)
        if os.path.exists(fp):
            os.remove(fp)
    except Exception as exc:
        logger.warning("Could not delete backup file %s: %s", record.filename, exc)

    await db.delete(record)
    await db.flush()


async def _prune_old_backups(db: AsyncSession) -> None:
    """Delete oldest backup records (and files) beyond the retention count."""
    from app.models.app_setting import AppSetting
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "backup_retention_count")
    )
    setting = result.scalar_one_or_none()
    retention = int(setting.value) if setting and setting.value.isdigit() else 10

    # Fetch all records ordered newest first
    all_result = await db.execute(
        select(BackupRecord).order_by(BackupRecord.created_at.desc())
    )
    all_records = list(all_result.scalars().all())

    to_delete = all_records[retention:]  # everything beyond the keep count
    for rec in to_delete:
        try:
            fp = _file_path(rec.filename)
            if os.path.exists(fp):
                os.remove(fp)
        except Exception as exc:
            logger.warning("Prune: could not remove file %s: %s", rec.filename, exc)
        await db.delete(rec)

    if to_delete:
        logger.info("Pruned %d old backup(s)", len(to_delete))


# ── Schedule settings ─────────────────────────────────────────────────────────

SCHEDULE_KEYS = {
    "backup_enabled": "false",
    "backup_frequency": "daily",   # daily | weekly
    "backup_hour": "2",            # 0-23
    "backup_day_of_week": "0",     # 0=Mon … 6=Sun (for weekly)
    "backup_retention_count": "10",
}


async def get_schedule(db: AsyncSession) -> dict:
    from app.models.app_setting import AppSetting
    result = await db.execute(
        select(AppSetting).where(AppSetting.key.in_(SCHEDULE_KEYS.keys()))
    )
    rows = {r.key: r.value for r in result.scalars().all()}
    return {k: rows.get(k, v) for k, v in SCHEDULE_KEYS.items()}


async def save_schedule(db: AsyncSession, data: dict) -> dict:
    from app.models.app_setting import AppSetting
    allowed = set(SCHEDULE_KEYS.keys())
    for key, value in data.items():
        if key not in allowed:
            continue
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = str(value)
        else:
            db.add(AppSetting(key=key, value=str(value)))
    await db.flush()
    return await get_schedule(db)


async def run_scheduled_backup_check(db: AsyncSession, now: datetime | None = None) -> bool:
    """
    Evaluate whether it is time to take a scheduled backup and, if so, take it.

    Returns True when a backup was created, False when skipped.
    The caller is responsible for committing the session afterwards.
    """
    from datetime import timedelta

    schedule = await get_schedule(db)
    if schedule.get("backup_enabled", "false").lower() != "true":
        logger.info("Scheduled backup: disabled — skipping.")
        return False

    if now is None:
        now = datetime.now(timezone.utc)

    # Compare in Istanbul time so users configure hours in their local timezone
    now_local = now.astimezone(_ISTANBUL)
    backup_hour = int(schedule.get("backup_hour", "2"))
    frequency = schedule.get("backup_frequency", "daily")

    # Only run at the configured Istanbul hour
    if now_local.hour != backup_hour:
        logger.info(
            "Scheduled backup: current Istanbul hour %d ≠ configured hour %d — skipping.",
            now_local.hour, backup_hour,
        )
        return False

    # For weekly frequency: only run on the configured weekday (Istanbul time)
    if frequency == "weekly":
        backup_dow = int(schedule.get("backup_day_of_week", "0"))
        if now_local.weekday() != backup_dow:
            logger.info(
                "Scheduled backup: today Istanbul weekday %d ≠ configured weekday %d — skipping.",
                now_local.weekday(), backup_dow,
            )
            return False

    # Deduplication: skip if a scheduled backup ran within the past 23 hours
    cutoff = now - timedelta(hours=23)
    result = await db.execute(
        select(BackupRecord)
        .where(BackupRecord.backup_type == "scheduled")
        .where(BackupRecord.created_at >= cutoff)
        .limit(1)
    )
    if result.scalar_one_or_none() is not None:
        logger.info("Scheduled backup: already ran within the last 23 h — skipping.")
        return False

    logger.info(
        "Running scheduled backup (frequency=%s, Istanbul hour=%d)…", frequency, backup_hour
    )
    await create_backup(db, backup_type="scheduled", notes="Otomatik zamanlı yedek")
    # NOTE: caller is responsible for committing the session.
    # In production this is done by AsyncSessionLocal.begin() in main.py.
    return True
