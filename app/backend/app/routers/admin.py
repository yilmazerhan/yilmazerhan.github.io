import csv
import io
import uuid
import base64
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.kanban import Task
from app.models.worklog import WorkLog
from app.models.email_log import EmailLog
from app.schemas.admin import (
    SslCertificateResponse, BrandingResponse, BrandingUpdate,
    AuditLogResponse, AuditLogListResponse, DashboardStats,
    ReportScheduleCreate, ReportScheduleUpdate, ReportScheduleResponse,
)
from app.schemas.auth import MessageResponse
from app.services.ssl_service import SslService
from app.services.branding_service import get_branding, update_branding, update_logo
from app.core.dependencies import get_current_user, require_superadmin, require_manager_or_above

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── SSL ──────────────────────────────────────────────────────────────────────

@router.get("/ssl", response_model=list[SslCertificateResponse])
async def list_ssl_certs(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = SslService(db)
    return await svc.list_certificates()


@router.post("/ssl/upload-pem", response_model=SslCertificateResponse, status_code=201)
async def upload_pem(
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    name: str = Form(...),
    cert_file: UploadFile = File(...),
    key_file: UploadFile = File(...),
):
    cert_bytes = await cert_file.read()
    key_bytes = await key_file.read()
    svc = SslService(db)
    return await svc.upload_pem(name, cert_bytes, key_bytes, current_user.id)


@router.post("/ssl/upload-jks", response_model=SslCertificateResponse, status_code=201)
async def upload_jks(
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    name: str = Form(...),
    password: str = Form(...),
    jks_file: UploadFile = File(...),
):
    jks_bytes = await jks_file.read()
    svc = SslService(db)
    return await svc.upload_jks(name, jks_bytes, password, current_user.id)


@router.post("/ssl/activate/{cert_id}", response_model=SslCertificateResponse)
async def activate_cert(
    cert_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = SslService(db)
    return await svc.activate_certificate(cert_id)


@router.delete("/ssl/{cert_id}", response_model=MessageResponse)
async def delete_cert(
    cert_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = SslService(db)
    await svc.delete_certificate(cert_id)
    return {"message": "Sertifika silindi."}


# ─── Branding ─────────────────────────────────────────────────────────────────

@router.get("/settings/branding", response_model=BrandingResponse)
async def get_branding_settings(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await get_branding(db)


@router.put("/settings/branding", response_model=BrandingResponse)
async def update_branding_settings(
    body: BrandingUpdate,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await update_branding(db, current_user.id, body.company_name, body.primary_color)


@router.post("/settings/branding/logo", response_model=BrandingResponse)
async def upload_logo(
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    logo: UploadFile = File(...),
):
    # SVG is intentionally excluded — SVG files can contain JavaScript (XSS).
    if logo.content_type not in ("image/png", "image/jpeg", "image/webp"):
        from app.core.exceptions import ValidationError
        raise ValidationError("Logo PNG, JPEG veya WebP formatında olmalıdır. (SVG güvenlik nedeniyle kabul edilmez.)")

    data = await logo.read()
    if len(data) > 1_048_576:  # 1MB
        from app.core.exceptions import ValidationError
        raise ValidationError("Logo dosyası 1MB'dan küçük olmalıdır.")

    # Validate file magic bytes — never trust Content-Type alone (client-controlled)
    _MAGIC = {
        b"\x89PNG\r\n\x1a\n": "image/png",   # PNG
        b"\xff\xd8\xff": "image/jpeg",          # JPEG
        b"RIFF": "image/webp",                   # WebP (RIFF....WEBP)
    }
    def _check_magic(raw: bytes) -> str | None:
        for sig, mime in _MAGIC.items():
            if raw[:len(sig)] == sig:
                if mime == "image/webp" and raw[8:12] != b"WEBP":
                    continue
                return mime
        return None

    from app.core.exceptions import ValidationError as _VE
    detected_type = _check_magic(data)
    if not detected_type:
        raise _VE("Logo geçerli bir PNG, JPEG veya WebP dosyası olmalıdır.")
    # Use the detected type (not the client-supplied one) for the data URI
    b64 = base64.b64encode(data).decode()
    logo_url = f"data:{detected_type};base64,{b64}"
    return await update_logo(db, current_user.id, logo_url)


# ─── Audit Logs ───────────────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Optional[uuid.UUID] = Query(None),
    action: Optional[str] = Query(None),
    table_name: Optional[str] = Query(None, max_length=100),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    from sqlalchemy import outerjoin, literal_column
    from sqlalchemy.orm import aliased

    UserAlias = aliased(User, flat=True)

    # Base filter query on AuditLog
    q = select(AuditLog)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if action:
        q = q.where(AuditLog.action == action)
    if table_name:
        q = q.where(AuditLog.table_name.ilike(f"%{table_name}%"))
    if date_from:
        q = q.where(AuditLog.created_at >= date_from)
    if date_to:
        q = q.where(AuditLog.created_at < date_to + timedelta(days=1))

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    items_result = await db.execute(q.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit))
    logs = items_result.scalars().all()

    # Batch-fetch usernames for all user_ids in the current page
    user_ids = {log.user_id for log in logs if log.user_id}
    username_map: dict[uuid.UUID, str] = {}
    if user_ids:
        u_result = await db.execute(
            select(User.id, User.username).where(User.id.in_(user_ids))
        )
        for uid, uname in u_result:
            username_map[uid] = uname

    # Build response dicts enriched with username
    items = []
    for log in logs:
        items.append({
            "id": log.id,
            "user_id": log.user_id,
            "username": username_map.get(log.user_id) if log.user_id else None,
            "action": log.action,
            "table_name": log.table_name,
            "record_id": log.record_id,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at,
        })

    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ─── Dashboard Stats ──────────────────────────────────────────────────────────

@router.get("/stats/dashboard", response_model=DashboardStats)
async def dashboard_stats(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    today = date.today()
    week_ago = today - timedelta(days=7)

    total_users = (await db.execute(
        select(func.count()).select_from(User).where(User.is_deleted == False)
    )).scalar_one()

    active_users = (await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True, User.is_deleted == False)
    )).scalar_one()

    total_tasks = (await db.execute(
        select(func.count()).select_from(Task)
    )).scalar_one()

    active_tasks = (await db.execute(
        select(func.count()).select_from(Task).where(Task.is_archived == False)
    )).scalar_one()

    overdue_tasks = (await db.execute(
        select(func.count()).select_from(Task).where(Task.is_archived == False, Task.due_date < today)
    )).scalar_one()

    worklogs_this_week = (await db.execute(
        select(func.count()).select_from(WorkLog).where(WorkLog.log_date >= week_ago)
    )).scalar_one()

    emails_sent_today = (await db.execute(
        select(func.count()).select_from(EmailLog)
        .where(EmailLog.status == "sent", func.date(EmailLog.sent_at) == today)
    )).scalar_one()

    emails_failed_today = (await db.execute(
        select(func.count()).select_from(EmailLog)
        .where(EmailLog.status == "failed", func.date(EmailLog.created_at) == today)
    )).scalar_one()

    return DashboardStats(
        total_users=total_users,
        active_users=active_users,
        total_tasks=total_tasks,
        active_tasks=active_tasks,
        overdue_tasks=overdue_tasks,
        worklogs_this_week=worklogs_this_week,
        emails_sent_today=emails_sent_today,
        emails_failed_today=emails_failed_today,
    )


# ─── System Health ────────────────────────────────────────────────────────────

@router.get("/system-health")
async def system_health(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    import asyncio
    import redis.asyncio as aioredis
    from app.config import settings
    from app.tasks.celery_app import celery_app

    # Database check
    db_status = "ok"
    db_error = None
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = "error"
        db_error = str(exc)

    # Redis check
    redis_status = "ok"
    redis_error = None
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.aclose()
    except Exception as exc:
        redis_status = "error"
        redis_error = str(exc)

    # Celery worker check (run blocking call in thread executor)
    celery_status = "degraded"
    loop = asyncio.get_event_loop()
    try:
        stats = await loop.run_in_executor(
            None,
            lambda: celery_app.control.inspect(timeout=2.0).stats(),
        )
        if stats and isinstance(stats, dict) and len(stats) > 0:
            celery_status = "ok"
    except Exception:
        celery_status = "degraded"

    # Uptime
    try:
        from app.main import _APP_START_TIME
        import time
        uptime_seconds = int(time.time() - _APP_START_TIME)
    except Exception:
        uptime_seconds = 0

    return {
        "database": db_status,
        "redis": redis_status,
        "celery_worker": celery_status,
        "uptime_seconds": uptime_seconds,
        "db_error": db_error,
        "redis_error": redis_error,
    }


# ─── Backup ───────────────────────────────────────────────────────────────────

@router.get("/backup/download")
async def download_backup(
    _: Annotated[User, Depends(require_superadmin)],
):
    """Stream a pg_dump SQL backup. Requires pg_dump binary in the container."""
    import os
    import asyncio
    from datetime import datetime
    from urllib.parse import urlparse
    from fastapi import HTTPException
    from fastapi.responses import Response as FastAPIResponse
    from app.config import settings

    # Parse DATABASE_URL (strip async driver prefix)
    raw_url = settings.DATABASE_URL.replace("+asyncpg", "")
    parsed = urlparse(raw_url)

    env = {**os.environ, "PGPASSWORD": parsed.password or ""}
    host = parsed.hostname or "localhost"
    port = str(parsed.port or 5432)
    user = parsed.username or "postgres"
    dbname = (parsed.path or "").lstrip("/")

    try:
        proc = await asyncio.create_subprocess_exec(
            "pg_dump",
            "-h", host,
            "-p", port,
            "-U", user,
            "-d", dbname,
            "--no-password",
            "--format=plain",
            "--no-owner",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await proc.communicate()
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="pg_dump binary not available in this environment.")

    if proc.returncode != 0:
        import logging
        logging.getLogger(__name__).error(
            "pg_dump exited %d — details omitted for security", proc.returncode
        )
        raise HTTPException(status_code=500, detail="Veritabanı yedeği alınamadı.")

    filename = f"backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.sql"
    return FastAPIResponse(
        content=stdout,
        media_type="application/octet-stream",
        # Plain ASCII filename — no injection risk, no RFC 5987 encoding needed
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── User Activity Report ──────────────────────────────────────────────────────

@router.get("/reports/user/{user_id}")
async def user_activity_report(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    from app.models.worklog import WorkLog, WorkType
    from app.models.kanban import Task, KanbanColumn

    # Fetch subject user
    u_result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    subject = u_result.scalar_one_or_none()
    if not subject:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Kullanıcı")

    # Team managers may only view reports for users in their own teams
    if current_user.role == "team_manager":
        from app.models.user_team import user_teams as ut
        from app.core.exceptions import ForbiddenError as _ForbiddenError
        shared = await db.execute(
            select(ut.c.team_id).where(
                ut.c.user_id == current_user.id,
                ut.c.team_id.in_(
                    select(ut.c.team_id).where(ut.c.user_id == user_id)
                ),
            ).limit(1)
        )
        if not shared.scalar_one_or_none():
            raise _ForbiddenError("Yalnızca kendi takımınızdaki kullanıcıların raporlarına erişebilirsiniz.")

    # Default: last 30 days
    end = date_to or date.today()
    start = date_from or (end - timedelta(days=30))

    # Work logs in range
    wl_q = (
        select(WorkLog)
        .options(selectinload(WorkLog.work_type))
        .where(
            WorkLog.user_id == user_id,
            WorkLog.log_date >= start,
            WorkLog.log_date <= end,
        )
        .order_by(WorkLog.log_date.desc())
    )
    wl_result = await db.execute(wl_q)
    logs = wl_result.scalars().all()

    total_hours = sum(l.duration_hours for l in logs)
    hours_by_type: dict[str, dict] = {}
    for l in logs:
        k = str(l.work_type_id)
        if k not in hours_by_type:
            hours_by_type[k] = {"name": l.work_type.name, "name_key": l.work_type.name_key, "color": l.work_type.color, "hours": 0, "count": 0}
        hours_by_type[k]["hours"] += l.duration_hours
        hours_by_type[k]["count"] += 1

    # Tasks assigned to this user
    from sqlalchemy.orm import selectinload as sil
    tasks_result = await db.execute(
        select(Task)
        .options(sil(Task.column))
        .where(Task.assignee_id == user_id)
    )
    all_tasks = tasks_result.scalars().all()
    active_tasks = [t for t in all_tasks if not t.is_archived]
    archived_tasks = [t for t in all_tasks if t.is_archived]
    today = date.today()
    overdue = [t for t in active_tasks if t.due_date and t.due_date < today]

    tasks_by_column: dict[str, dict] = {}
    for t in active_tasks:
        col_name = t.column.name if t.column else "Unknown"
        col_name_key = t.column.name_key if t.column else None
        col_color = t.column.color if t.column else "#888"
        k = str(t.column_id)
        if k not in tasks_by_column:
            tasks_by_column[k] = {"name": col_name, "name_key": col_name_key, "color": col_color, "count": 0}
        tasks_by_column[k]["count"] += 1

    return {
        "user": {
            "id": str(subject.id),
            "full_name": subject.full_name,
            "email": subject.email,
            "username": subject.username,
            "role": subject.role,
            "team_id": str(subject.team_id) if subject.team_id else None,
        },
        "period": {"date_from": start.isoformat(), "date_to": end.isoformat()},
        "work_log_summary": {
            "total_hours": float(total_hours),
            "entry_count": len(logs),
            "hours_by_type": list(hours_by_type.values()),
        },
        "task_summary": {
            "active": len(active_tasks),
            "archived": len(archived_tasks),
            "overdue": len(overdue),
            "by_column": list(tasks_by_column.values()),
        },
        "recent_logs": [
            {
                "log_date": l.log_date.isoformat(),
                "work_type": l.work_type.name,
                "work_type_color": l.work_type.color,
                "duration_hours": float(l.duration_hours),
                "description": l.description,
            }
            for l in logs[:20]
        ],
    }


# ─── Report CSV Export ───────────────────────────────────────────────────────

@router.get("/reports/user/{user_id}/export")
async def export_user_report_csv(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Download a user's work-log entries as a CSV file."""
    from app.models.worklog import WorkLog

    # Team managers: check team membership (same check as activity report)
    if current_user.role == "team_manager":
        from app.models.user_team import user_teams as ut
        from app.core.exceptions import ForbiddenError as _ForbiddenError
        shared = await db.execute(
            select(ut.c.team_id).where(
                ut.c.user_id == current_user.id,
                ut.c.team_id.in_(
                    select(ut.c.team_id).where(ut.c.user_id == user_id)
                ),
            ).limit(1)
        )
        if not shared.scalar_one_or_none():
            raise _ForbiddenError("Yalnızca kendi takımınızdaki kullanıcıların raporlarına erişebilirsiniz.")

    # Resolve subject user
    from app.core.exceptions import NotFoundError as _NotFoundError
    u_res = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    subject = u_res.scalar_one_or_none()
    if not subject:
        raise _NotFoundError("Kullanıcı")

    end = date_to or date.today()
    start = date_from or (end - timedelta(days=30))

    wl_q = (
        select(WorkLog)
        .options(selectinload(WorkLog.work_type))
        .where(WorkLog.user_id == user_id, WorkLog.log_date >= start, WorkLog.log_date <= end)
        .order_by(WorkLog.log_date.desc())
    )
    logs = (await db.execute(wl_q)).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Work Type", "Duration (h)", "Description"])
    for log in logs:
        writer.writerow([
            log.log_date.isoformat(),
            log.work_type.name if log.work_type else "",
            float(log.duration_hours),
            log.description or "",
        ])

    output.seek(0)
    filename = f"worklogs_{subject.username}_{start}_{end}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── Report Schedules ────────────────────────────────────────────────────────

@router.get("/reports/schedules", response_model=list[ReportScheduleResponse])
async def list_report_schedules(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.report_schedule import ReportSchedule
    result = await db.execute(select(ReportSchedule).order_by(ReportSchedule.created_at.desc()))
    return result.scalars().all()


@router.post("/reports/schedules", response_model=ReportScheduleResponse, status_code=201)
async def create_report_schedule(
    body: ReportScheduleCreate,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.report_schedule import ReportSchedule
    from app.services.report_schedule_service import compute_next_run

    schedule = ReportSchedule(
        name=body.name,
        frequency=body.frequency,
        day_of_week=body.day_of_week,
        day_of_month=body.day_of_month,
        hour=body.hour,
        recipient_emails=body.recipient_emails,
        team_id=body.team_id,
        user_id=body.user_id,
        date_range_days=body.date_range_days,
        is_active=body.is_active,
        created_by=current_user.id,
        next_run_at=compute_next_run(body.frequency, body.day_of_week, body.day_of_month, body.hour),
    )
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)
    return schedule


@router.patch("/reports/schedules/{schedule_id}", response_model=ReportScheduleResponse)
async def update_report_schedule(
    schedule_id: uuid.UUID,
    body: ReportScheduleUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.report_schedule import ReportSchedule
    from fastapi import HTTPException
    result = await db.execute(select(ReportSchedule).where(ReportSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Zamanlama bulunamadı.")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(schedule, field, value)
    await db.flush()
    await db.refresh(schedule)
    return schedule


@router.delete("/reports/schedules/{schedule_id}", status_code=204)
async def delete_report_schedule(
    schedule_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.report_schedule import ReportSchedule
    from fastapi import HTTPException
    result = await db.execute(select(ReportSchedule).where(ReportSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Zamanlama bulunamadı.")
    await db.delete(schedule)
    await db.flush()


@router.post("/reports/schedules/{schedule_id}/run", response_model=dict)
async def run_report_schedule(
    schedule_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.report_schedule import ReportSchedule
    from app.services.report_schedule_service import generate_and_send_report, compute_next_run
    from fastapi import HTTPException
    from datetime import datetime

    result = await db.execute(select(ReportSchedule).where(ReportSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Zamanlama bulunamadı.")

    count = await generate_and_send_report(db, schedule)
    from datetime import timezone as _tz
    schedule.last_run_at = datetime.now(_tz.utc)
    schedule.next_run_at = compute_next_run(schedule.frequency, schedule.day_of_week, schedule.day_of_month, schedule.hour)
    await db.flush()
    return {"sent": count, "message": f"{count} alıcıya rapor gönderildi."}
