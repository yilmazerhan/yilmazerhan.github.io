"""
Celery tasks for email sending, Teams notifications, and scheduled workflow evaluation.
"""
import asyncio
import logging
from datetime import date, timedelta, datetime, timezone
from typing import Optional
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import ssl as ssl_lib

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


async def send_auth_email_direct(
    template_slug: str,
    to_email: str,
    variables: dict,
) -> None:
    """Send a transactional auth email directly (no Celery / Redis required).

    Used for user creation, password reset, and activation emails via
    FastAPI BackgroundTasks.  Runs in the server process event loop so
    it never depends on the broker being available.
    """
    from app.database import AsyncSessionLocal
    from app.services.email_service import EmailService
    from app.models.app_setting import AppSetting
    from app.core.security import decrypt_field
    from app.config import settings
    from sqlalchemy import select

    log = None
    try:
        async with AsyncSessionLocal() as db:
            svc = EmailService(db)

            template = await svc.get_template_by_slug(template_slug)
            if not template:
                logger.error("send_auth_email_direct: template not found: %s", template_slug)
                return

            smtp_cfg = await svc.get_smtp_config()
            if not smtp_cfg:
                logger.warning(
                    "send_auth_email_direct: SMTP not configured — skipping %s to %s",
                    template_slug, to_email,
                )
                return

            # Inject app branding
            name_row = (await db.execute(
                select(AppSetting).where(AppSetting.key == "company_name")
            )).scalar_one_or_none()
            app_name = (name_row.value if name_row and name_row.value else "")
            merged_vars = {"app_name": app_name, "app_url": settings.FRONTEND_URL.rstrip("/"), **variables}

            subject, html_body = svc.render_template(template, merged_vars)

            # Decrypt password while session is open so we don't need a second DB round-trip
            password = decrypt_field(smtp_cfg.password_encrypted, settings.SMTP_ENCRYPTION_KEY)

            log = await svc.create_log_entry(
                to_email=to_email,
                subject=subject,
                template_id=template.id,
            )
            await db.commit()

        # Build message outside the session (no DB needed)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{smtp_cfg.from_name} <{smtp_cfg.from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        ctx = ssl_lib.create_default_context()
        if smtp_cfg.use_ssl:
            with smtplib.SMTP_SSL(smtp_cfg.host, smtp_cfg.port, context=ctx, timeout=15) as server:
                server.login(smtp_cfg.username, password)
                server.sendmail(smtp_cfg.from_email, [to_email], msg.as_string())
        elif smtp_cfg.use_tls:
            with smtplib.SMTP(smtp_cfg.host, smtp_cfg.port, timeout=15) as server:
                server.ehlo()
                server.starttls(context=ctx)
                server.ehlo()
                server.login(smtp_cfg.username, password)
                server.sendmail(smtp_cfg.from_email, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(smtp_cfg.host, smtp_cfg.port, timeout=15) as server:
                server.ehlo()
                server.login(smtp_cfg.username, password)
                server.sendmail(smtp_cfg.from_email, [to_email], msg.as_string())

        # Mark log sent
        async with AsyncSessionLocal() as db:
            await _mark_log_sent(db, str(log.id))
            await db.commit()

        logger.info("send_auth_email_direct: sent %s to %s", template_slug, to_email)

    except Exception as exc:
        logger.error(
            "send_auth_email_direct: failed to send %s to %s: %s",
            template_slug, to_email, exc, exc_info=True,
        )
        # Best-effort: mark log failed (only if the log entry was created)
        if log is not None:
            try:
                async with AsyncSessionLocal() as db:
                    await _mark_log_failed(db, str(log.id), str(exc)[:1000])
                    await db.commit()
            except Exception:
                pass


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(
    self,
    to_email: str,
    subject: str,
    html_body: str,
    log_id: Optional[str] = None,
):
    try:
        asyncio.run(_send_email_async(to_email, subject, html_body, log_id))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _send_email_async(to_email: str, subject: str, html_body: str, log_id: Optional[str]):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.services.email_service import EmailService
    from app.core.security import decrypt_field
    from app.config import settings
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            svc = EmailService(db)
            smtp_cfg = await svc.get_smtp_config()
            if not smtp_cfg:
                if log_id:
                    await _mark_log_failed(db, log_id, "SMTP yapılandırması yok.")
                    await db.commit()
                return

            password = decrypt_field(smtp_cfg.password_encrypted, settings.SMTP_ENCRYPTION_KEY)

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{smtp_cfg.from_name} <{smtp_cfg.from_email}>"
            msg["To"] = to_email
            msg.attach(MIMEText(html_body, "html", "utf-8"))

            try:
                context = ssl_lib.create_default_context()
                if getattr(smtp_cfg, 'use_ssl', False):
                    with smtplib.SMTP_SSL(smtp_cfg.host, smtp_cfg.port, context=context, timeout=15) as server:
                        server.login(smtp_cfg.username, password)
                        server.sendmail(smtp_cfg.from_email, [to_email], msg.as_string())
                elif smtp_cfg.use_tls:
                    with smtplib.SMTP(smtp_cfg.host, smtp_cfg.port, timeout=15) as server:
                        server.ehlo()
                        server.starttls(context=context)
                        server.ehlo()
                        server.login(smtp_cfg.username, password)
                        server.sendmail(smtp_cfg.from_email, [to_email], msg.as_string())
                else:
                    with smtplib.SMTP(smtp_cfg.host, smtp_cfg.port, timeout=15) as server:
                        server.ehlo()
                        server.login(smtp_cfg.username, password)
                        server.sendmail(smtp_cfg.from_email, [to_email], msg.as_string())

                if log_id:
                    await _mark_log_sent(db, log_id)
                await db.commit()
            except Exception as e:
                if log_id:
                    await _mark_log_failed(db, log_id, str(e))
                    try:
                        await db.commit()
                    except Exception:
                        pass
                raise
    finally:
        await engine.dispose()


async def _mark_log_sent(db, log_id: str):
    import uuid
    from sqlalchemy import select, update
    from app.models.email_log import EmailLog
    await db.execute(
        update(EmailLog)
        .where(EmailLog.id == uuid.UUID(log_id))
        .values(status="sent", sent_at=datetime.now(timezone.utc))
    )


async def _mark_log_failed(db, log_id: str, error: str):
    import uuid
    from sqlalchemy import update
    from app.models.email_log import EmailLog
    await db.execute(
        update(EmailLog)
        .where(EmailLog.id == uuid.UUID(log_id))
        .values(status="failed", error_message=error[:1000])
    )


def _smtp_deliver_sync(
    *, host: str, port: int, use_tls: bool, use_ssl: bool,
    username: str, password: str, from_email: str, to_email: str, raw_message: str,
) -> None:
    """Blocking SMTP delivery of a pre-built message. Raises on failure.

    Pure-primitive arguments (no ORM objects) so it is safe to run in a worker
    thread via asyncio.to_thread without touching the async DB session.
    """
    context = ssl_lib.create_default_context()
    if use_ssl:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as server:
            server.login(username, password)
            server.sendmail(from_email, [to_email], raw_message)
    elif use_tls:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(username, password)
            server.sendmail(from_email, [to_email], raw_message)
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.login(username, password)
            server.sendmail(from_email, [to_email], raw_message)


async def _dispatch_email_inline(db, to_email: str, subject: str, html_body: str, log_id: str) -> bool:
    """Send one scheduled/workflow email directly in-process and update its log.

    Unlike send_email_task.delay(), this does NOT require a running Celery worker —
    scheduled emails are delivered even when the broker is unavailable.  The
    EmailLog row identified by log_id must already be flushed in `db`.  The
    blocking SMTP I/O runs in a worker thread so the caller's event loop (the
    uvicorn server loop, for the in-process scheduler) is never blocked.
    Returns True on success, False otherwise.  Never raises.
    """
    from app.services.email_service import EmailService
    from app.core.security import decrypt_field
    from app.config import settings

    svc = EmailService(db)
    smtp_cfg = await svc.get_smtp_config()
    if not smtp_cfg:
        logger.warning("Inline email to %s skipped — SMTP not configured", to_email)
        await _mark_log_failed(db, log_id, "SMTP yapılandırması yok.")
        return False

    try:
        password = decrypt_field(smtp_cfg.password_encrypted, settings.SMTP_ENCRYPTION_KEY)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{smtp_cfg.from_name} <{smtp_cfg.from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        await asyncio.to_thread(
            _smtp_deliver_sync,
            host=smtp_cfg.host,
            port=smtp_cfg.port,
            use_tls=bool(smtp_cfg.use_tls),
            use_ssl=bool(getattr(smtp_cfg, "use_ssl", False)),
            username=smtp_cfg.username,
            password=password,
            from_email=smtp_cfg.from_email,
            to_email=to_email,
            raw_message=msg.as_string(),
        )
        await _mark_log_sent(db, log_id)
        return True
    except Exception as exc:
        logger.error("Inline email send to %s failed: %s", to_email, exc)
        await _mark_log_failed(db, log_id, str(exc))
        return False


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_activation_email_task(self, to_email: str, full_name: str, activation_token: str):
    try:
        asyncio.run(_send_auth_email_async(
            to_email=to_email,
            template_slug="account_activation",
            variables={
                "full_name": full_name,
                "activation_url": _build_url(f"/activate/{activation_token}"),
                "expires_in": _get_setting("ACCOUNT_ACTIVATION_TOKEN_EXPIRE_HOURS", 48),
            },
        ))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_new_account_email_task(self, to_email: str, full_name: str, username: str, temp_password: str):
    try:
        asyncio.run(_send_auth_email_async(
            to_email=to_email,
            template_slug="new_account",
            variables={
                "full_name": full_name,
                "username": username,
                "temp_password": temp_password,
                "login_url": _build_url("/login"),
            },
        ))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_password_reset_email_task(self, to_email: str, full_name: str, reset_token: str):
    try:
        asyncio.run(_send_auth_email_async(
            to_email=to_email,
            template_slug="password_reset",
            variables={
                "full_name": full_name,
                "reset_url": _build_url(f"/reset-password?token={reset_token}"),
                "expires_in": _get_setting("PASSWORD_RESET_TOKEN_EXPIRE_HOURS", 1),
            },
        ))
    except Exception as exc:
        raise self.retry(exc=exc)


def _build_url(path: str) -> str:
    from app.config import settings
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _get_setting(attr: str, default):
    from app.config import settings
    return getattr(settings, attr, default)


async def _send_auth_email_async(to_email: str, template_slug: str, variables: dict):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.services.email_service import EmailService
    from app.models.app_setting import AppSetting
    from app.config import settings
    from sqlalchemy import select
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    subject = html_body = log_id = None
    try:
        async with Session() as db:
            svc = EmailService(db)
            template = await svc.get_template_by_slug(template_slug)
            if not template:
                return

            setting_result = await db.execute(
                select(AppSetting).where(AppSetting.key == "company_name")
            )
            name_row = setting_result.scalar_one_or_none()
            app_name = name_row.value if name_row and name_row.value else ""
            app_url = settings.FRONTEND_URL.rstrip("/")
            merged_vars = {"app_name": app_name, "app_url": app_url, **variables}

            subject, html_body = svc.render_template(template, merged_vars)
            log = await svc.create_log_entry(
                to_email=to_email,
                subject=subject,
                template_id=template.id,
            )
            log_id = str(log.id)
            await db.commit()
    finally:
        await engine.dispose()

    # Delegate actual SMTP delivery to the generic send task (outside the session)
    if subject and html_body and log_id:
        send_email_task.delay(to_email=to_email, subject=subject, html_body=html_body, log_id=log_id)


@celery_app.task(bind=True, max_retries=2)
def send_teams_message_task(
    self,
    webhook_id: str,
    title: str,
    body: str,
    action_url: Optional[str] = None,
):
    try:
        asyncio.run(_send_teams_async(webhook_id, title, body, action_url))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _send_teams_async(webhook_id: str, title: str, body: str, action_url: Optional[str]):
    import uuid
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.services.teams_service import TeamsService
    from app.config import settings
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            svc = TeamsService(db)
            await svc.send_message(uuid.UUID(webhook_id), title, body, action_url)
            await db.commit()
    finally:
        await engine.dispose()


_EMAIL_HEARTBEAT_KEY = "email_celery_heartbeat"


async def _write_email_heartbeat(db) -> None:
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.app_setting import AppSetting
    ts = datetime.now(timezone.utc).isoformat()
    row = (await db.execute(select(AppSetting).where(AppSetting.key == _EMAIL_HEARTBEAT_KEY))).scalar_one_or_none()
    if row:
        row.value = ts
    else:
        db.add(AppSetting(key=_EMAIL_HEARTBEAT_KEY, value=ts))


@celery_app.task
def evaluate_scheduled_workflows():
    asyncio.run(_evaluate_workflows_async())


def _workflow_tz(wf):
    """Return the ZoneInfo for a workflow's configured timezone (default: Istanbul)."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    tz_name = (wf.trigger_config or {}).get("timezone", "Europe/Istanbul") or "Europe/Istanbul"
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        return ZoneInfo("Europe/Istanbul")


async def _evaluate_workflows_async():
    from zoneinfo import ZoneInfo
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from sqlalchemy import select
    from app.models.email_workflow import EmailWorkflow
    from app.config import settings
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    _ISTANBUL = ZoneInfo("Europe/Istanbul")

    try:
        async with Session() as hb_db:
            await _write_email_heartbeat(hb_db)
            await hb_db.commit()
    except Exception as hb_exc:
        logger.warning("Could not update email Celery heartbeat: %s", hb_exc)

    try:
        async with Session() as db:
            result = await db.execute(
                select(EmailWorkflow).where(EmailWorkflow.is_active == True)
            )
            workflows = result.scalars().all()

            now = datetime.now(timezone.utc)
            now_istanbul = now.astimezone(_ISTANBUL)
            today_istanbul = now_istanbul.date()

            for wf in workflows:
                try:
                    if wf.trigger_type == "task_due_soon":
                        days_before = (wf.trigger_config or {}).get("days_before", 3)
                        target_date = today_istanbul + timedelta(days=days_before)
                        await _handle_task_due_soon(db, wf, target_date)

                    elif wf.trigger_type == "task_overdue":
                        await _handle_task_overdue(db, wf, today_istanbul)

                    elif wf.trigger_type in ("worklog_reminder", "dashboard_report"):
                        wf_tz = _workflow_tz(wf)
                        now_local = now.astimezone(wf_tz)
                        today_local = now_local.date()
                        hour = (wf.trigger_config or {}).get(
                            "send_hour", 17 if wf.trigger_type == "worklog_reminder" else 8
                        )

                        if now_local.hour == hour:
                            if wf.trigger_type == "worklog_reminder":
                                await _handle_worklog_reminder(db, wf, today_local)
                            else:
                                frequency = (wf.trigger_config or {}).get("frequency", "daily")
                                day_of_week = (wf.trigger_config or {}).get("day_of_week", 0)
                                if frequency == "daily" or (frequency == "weekly" and today_local.weekday() == day_of_week):
                                    await _handle_dashboard_report(db, wf, today_local)

                    wf.last_run_at = now
                except Exception as exc:
                    logger.error(
                        "Workflow %s (%s) raised an error and was skipped: %s",
                        wf.id, wf.trigger_type, exc, exc_info=True,
                    )

            await db.commit()
    finally:
        await engine.dispose()


async def _handle_task_due_soon(db, workflow, target_date: date):
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.kanban import Task
    from app.services.email_service import EmailService

    svc = EmailService(db)
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(
            Task.due_date == target_date,
            Task.is_archived == False,
            Task.assignee_id.isnot(None),
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        if not task.assignee:
            continue
        priority_filter = (workflow.condition_config or {}).get("priority", [])
        if priority_filter and task.priority not in priority_filter:
            continue

        import uuid
        recipient_id = task.assignee_id
        if await svc.already_sent_today(workflow.id, recipient_id):
            continue

        template = await svc.get_template(workflow.template_id)
        subject, html = svc.render_template(template, {
            "task_title": task.title,
            "due_date": str(task.due_date),
            "assignee_name": task.assignee.full_name,
            "priority": task.priority,
        })

        log = await svc.create_log_entry(
            to_email=task.assignee.email,
            subject=subject,
            workflow_id=workflow.id,
            template_id=workflow.template_id,
            recipient_id=recipient_id,
        )
        await db.flush()

        await _dispatch_email_inline(db, task.assignee.email, subject, html, str(log.id))

        if workflow.send_teams and workflow.teams_webhook_id:
            send_teams_message_task.delay(
                webhook_id=str(workflow.teams_webhook_id),
                title=f"Görev Yaklaşan Bitiş: {task.title}",
                body=f"Görev {str(task.due_date)} tarihinde bitiyor.\nAtanan: {task.assignee.full_name}",
            )


async def _handle_task_overdue(db, workflow, today: date):
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.kanban import Task, KanbanColumn
    from app.services.email_service import EmailService

    svc = EmailService(db)
    # Only non-terminal columns
    result = await db.execute(
        select(Task)
        .join(KanbanColumn, Task.column_id == KanbanColumn.id)
        .options(selectinload(Task.assignee))
        .where(
            Task.due_date < today,
            Task.is_archived == False,
            KanbanColumn.is_terminal == False,
            Task.assignee_id.isnot(None),
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        if not task.assignee:
            continue
        if await svc.already_sent_today(workflow.id, task.assignee_id):
            continue

        template = await svc.get_template(workflow.template_id)
        subject, html = svc.render_template(template, {
            "task_title": task.title,
            "due_date": str(task.due_date),
            "assignee_name": task.assignee.full_name,
        })

        log = await svc.create_log_entry(
            to_email=task.assignee.email,
            subject=subject,
            workflow_id=workflow.id,
            template_id=workflow.template_id,
            recipient_id=task.assignee_id,
        )
        await db.flush()

        await _dispatch_email_inline(db, task.assignee.email, subject, html, str(log.id))


async def _handle_worklog_reminder(db, workflow, today: date):
    from sqlalchemy import select, func
    from app.models.user import User
    from app.models.worklog import WorkLog
    from app.services.email_service import EmailService

    svc = EmailService(db)
    active_users = await db.execute(
        select(User).where(User.is_active == True, User.is_deleted == False)
    )
    users = active_users.scalars().all()

    logged_today = await db.execute(
        select(WorkLog.user_id).where(WorkLog.log_date == today).distinct()
    )
    logged_ids = {row[0] for row in logged_today.all()}

    for user in users:
        if user.id in logged_ids:
            continue
        if await svc.already_sent_today(workflow.id, user.id):
            continue

        template = await svc.get_template(workflow.template_id)
        subject, html = svc.render_template(template, {
            "user_name": user.full_name,
            "date": str(today),
        })

        log = await svc.create_log_entry(
            to_email=user.email,
            subject=subject,
            workflow_id=workflow.id,
            template_id=workflow.template_id,
            recipient_id=user.id,
        )
        await db.flush()

        await _dispatch_email_inline(db, user.email, subject, html, str(log.id))


async def _handle_dashboard_report(db, workflow, today: date):
    from sqlalchemy import select, func as sqlfunc
    from app.models.user import User
    from app.models.kanban import Task, KanbanColumn
    from app.models.worklog import WorkLog
    from app.models.email_log import EmailLog
    from app.services.email_service import EmailService
    from datetime import datetime, timezone, timedelta

    svc = EmailService(db)

    # Build recipient email list based on recipient_type
    recipient_emails = []
    if workflow.recipient_type == "specific_emails" and workflow.recipient_users:
        recipient_emails = [e for e in workflow.recipient_users if isinstance(e, str) and "@" in e]
    elif workflow.recipient_type == "all_users":
        from app.models.user import User as _User
        all_result = await db.execute(
            select(_User).where(_User.is_active == True, _User.is_deleted == False)
        )
        recipient_emails = [u.email for u in all_result.scalars().all()]

    if not recipient_emails:
        return

    # Collect dashboard stats
    now_utc = datetime.now(timezone.utc)
    week_ago = now_utc - timedelta(days=7)
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)

    # Deduplicate: check email_logs for any entry sent today via this workflow
    already_sent = (await db.execute(
        select(sqlfunc.count(EmailLog.id)).where(
            EmailLog.workflow_id == workflow.id,
            EmailLog.created_at >= today_start,
        )
    )).scalar_one()
    if already_sent > 0:
        return

    total_users = (await db.execute(select(sqlfunc.count()).where(User.is_deleted == False))).scalar_one()
    active_users = (await db.execute(select(sqlfunc.count()).where(User.is_active == True, User.is_deleted == False))).scalar_one()
    total_tasks = (await db.execute(select(sqlfunc.count(Task.id)))).scalar_one()
    active_tasks = (await db.execute(select(sqlfunc.count(Task.id)).where(Task.is_archived == False))).scalar_one()
    overdue_tasks = (await db.execute(
        select(sqlfunc.count(Task.id))
        .join(KanbanColumn, Task.column_id == KanbanColumn.id)
        .where(Task.is_archived == False, Task.due_date < today, KanbanColumn.is_terminal == False)
    )).scalar_one()
    worklogs_week = (await db.execute(
        select(sqlfunc.count(WorkLog.id)).where(WorkLog.log_date >= week_ago.date())
    )).scalar_one()
    emails_sent = (await db.execute(
        select(sqlfunc.count(EmailLog.id)).where(EmailLog.status == "sent", EmailLog.sent_at >= today_start)
    )).scalar_one()

    template = await svc.get_template_by_slug("dashboard_report")
    if not template:
        return

    variables = {
        "report_date": str(today),
        "total_users": total_users,
        "active_users": active_users,
        "total_tasks": total_tasks,
        "active_tasks": active_tasks,
        "overdue_tasks": overdue_tasks,
        "worklogs_this_week": worklogs_week,
        "emails_sent_today": emails_sent,
    }

    for email in recipient_emails:
        subject, html = svc.render_template(template, variables)
        log = await svc.create_log_entry(
            to_email=email,
            subject=subject,
            workflow_id=workflow.id,
            template_id=workflow.template_id,
        )
        await db.flush()
        await _dispatch_email_inline(db, email, subject, html, str(log.id))


@celery_app.task
def refresh_jira_statuses():
    asyncio.run(_refresh_jira_async())


async def _refresh_jira_async():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.services.jira_service import JiraService
    from app.config import settings
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            svc = JiraService(db)
            await svc.bulk_refresh_jira_statuses()
            await db.commit()
    finally:
        await engine.dispose()


@celery_app.task(name="app.tasks.email_tasks.send_worklog_reminders")
def send_worklog_reminders():
    asyncio.run(_send_worklog_reminders_async())


_WORKLOG_REMINDER_HOUR = 17  # 17:00 Europe/Istanbul, Mon–Fri


async def _send_worklog_reminders_async():
    """Email a reminder to every active user who has not logged work today.

    Delivery is in-process (no Celery worker required).  This is gated to
    Mon–Fri at 17:00 Europe/Istanbul so that it is safe to call from BOTH the
    Celery Beat schedule and the every-15-minute in-process scheduler loop —
    the per-user EmailLog dedup guarantees a single reminder per user per day
    even when several 17:xx ticks fire.
    """
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    from sqlalchemy import select, func
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.models.user import User
    from app.models.worklog import WorkLog
    from app.models.email_log import EmailLog
    from app.services.email_service import EmailService
    from app.config import settings

    now_ist = datetime.now(ZoneInfo("Europe/Istanbul"))
    if now_ist.weekday() >= 5:  # Saturday=5, Sunday=6
        logger.info("send_worklog_reminders: skipping — weekend")
        return
    if now_ist.hour != _WORKLOG_REMINDER_HOUR:
        # Not the reminder hour (e.g. an off-hour in-process tick) — skip quietly.
        return

    today = now_ist.date()

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            svc = EmailService(db)

            smtp_cfg = await svc.get_smtp_config()
            if not smtp_cfg:
                logger.warning("send_worklog_reminders: SMTP not configured — skipping")
                return

            template = await svc.get_template_by_slug("worklog_reminder")
            if not template:
                logger.error("send_worklog_reminders: 'worklog_reminder' template not found in DB")
                return

            active_users = (await db.execute(
                select(User).where(User.is_active == True, User.is_deleted == False)
            )).scalars().all()

            logged_today = (await db.execute(
                select(WorkLog.user_id).where(WorkLog.log_date == today).distinct()
            )).scalars().all()
            logged_ids = set(logged_today)

            today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)

            for user in active_users:
                if user.id in logged_ids:
                    continue

                # Dedup: count pending+sent (not failed, so failures can retry).
                already_sent = (await db.execute(
                    select(func.count(EmailLog.id)).where(
                        EmailLog.template_id == template.id,
                        EmailLog.recipient_id == user.id,
                        EmailLog.status.in_(["sent", "pending"]),
                        EmailLog.created_at >= today_start,
                    )
                )).scalar_one()
                if already_sent > 0:
                    continue

                subject, html = svc.render_template(template, {
                    "user_name": user.full_name,
                    "date": str(today),
                })

                # Commit the pending log BEFORE sending so the dedup record
                # survives a crash and prevents a duplicate on the next tick.
                log = await svc.create_log_entry(
                    to_email=user.email,
                    subject=subject,
                    template_id=template.id,
                    recipient_id=user.id,
                )
                await db.commit()

                await _dispatch_email_inline(db, user.email, subject, html, str(log.id))
                await db.commit()
                logger.info("send_worklog_reminders: sent reminder to %s", user.email)

            logger.info("send_worklog_reminders: done for %s", today)
    finally:
        await engine.dispose()


_TEAM_TASK_REMINDER_HOUR = 9  # 09:00 Europe/Istanbul


async def _send_team_task_reminders_async():
    """Send daily deadline reminders for team tasks.

    For each team task where status != 'done' and today <= deadline and
    today >= deadline - reminder_days_before, sends one email per assignee.
    Gated to 09:00 Europe/Istanbul; safe to call every 15 min due to
    per-task/per-user EmailLog dedup.
    """
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    from sqlalchemy import select, func
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from sqlalchemy.orm import selectinload
    from app.models.team_task import TeamTask
    from app.models.email_log import EmailLog
    from app.services.email_service import EmailService
    from app.config import settings

    now_ist = datetime.now(ZoneInfo("Europe/Istanbul"))
    if now_ist.hour != _TEAM_TASK_REMINDER_HOUR:
        return

    today = now_ist.date()

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            svc = EmailService(db)

            template = await svc.get_template_by_slug("team_task_reminder")
            if not template:
                logger.warning("_send_team_task_reminders_async: template 'team_task_reminder' not found")
                return

            result = await db.execute(
                select(TeamTask)
                .options(selectinload(TeamTask.assignees))
                .where(
                    TeamTask.status != "done",
                    TeamTask.deadline >= today,
                )
            )
            tasks = result.scalars().all()

            for task in tasks:
                days_left = (task.deadline - today).days
                if days_left > task.reminder_days_before:
                    continue

                for assignee in task.assignees:
                    # Skip assignees who already marked this task done for themselves
                    if assignee.completed_at is not None:
                        continue

                    # Dedup: check if already sent today for this task+user
                    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
                    sent_count = (await db.execute(
                        select(func.count()).where(
                            EmailLog.team_task_id == task.id,
                            EmailLog.recipient_id == assignee.user_id,
                            EmailLog.status.in_(["sent", "pending"]),
                            EmailLog.created_at >= today_start,
                        )
                    )).scalar_one()
                    if sent_count > 0:
                        continue

                    subject, html = svc.render_template(template, {
                        "task_title": task.title,
                        "assignee_name": assignee.full_name,
                        "deadline": str(task.deadline),
                        "days_left": days_left,
                        "description": task.description or "",
                    })

                    log = await svc.create_log_entry(
                        to_email=assignee.email,
                        subject=subject,
                        template_id=template.id,
                        recipient_id=assignee.user_id,
                        team_task_id=task.id,
                    )
                    await db.commit()

                    await _dispatch_email_inline(db, assignee.email, subject, html, str(log.id))
                    await db.commit()
                    logger.info(
                        "_send_team_task_reminders_async: sent reminder for task %s to %s",
                        task.id, assignee.user.email,
                    )

            logger.info("_send_team_task_reminders_async: done for %s", today)
    finally:
        await engine.dispose()
