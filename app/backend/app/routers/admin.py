import uuid
import base64
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import select, func
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
    if logo.content_type not in ("image/png", "image/jpeg", "image/svg+xml", "image/webp"):
        from app.core.exceptions import ValidationError
        raise ValidationError("Logo PNG, JPEG, SVG veya WebP formatında olmalıdır.")

    data = await logo.read()
    if len(data) > 1_048_576:  # 1MB
        from app.core.exceptions import ValidationError
        raise ValidationError("Logo dosyası 1MB'dan küçük olmalıdır.")

    b64 = base64.b64encode(data).decode()
    logo_url = f"data:{logo.content_type};base64,{b64}"
    return await update_logo(db, current_user.id, logo_url)


# ─── Audit Logs ───────────────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Optional[uuid.UUID] = Query(None),
    action: Optional[str] = Query(None),
    table_name: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
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
    items = items_result.scalars().all()

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
        raise HTTPException(status_code=500, detail=f"pg_dump failed: {stderr.decode()[:500]}")

    filename = f"backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.sql"
    return FastAPIResponse(
        content=stdout,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
    u_result = await db.execute(select(User).where(User.id == user_id))
    subject = u_result.scalar_one_or_none()
    if not subject:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Kullanıcı")

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
            hours_by_type[k] = {"name": l.work_type.name, "color": l.work_type.color, "hours": 0, "count": 0}
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
        col_name = t.column.name if t.column else "Bilinmeyen"
        col_color = t.column.color if t.column else "#888"
        k = str(t.column_id)
        if k not in tasks_by_column:
            tasks_by_column[k] = {"name": col_name, "color": col_color, "count": 0}
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
