"""
Celery tasks for email sending, Teams notifications, and scheduled workflow evaluation.
"""
import asyncio
from datetime import date, timedelta, datetime, timezone
from typing import Optional
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import ssl as ssl_lib

from app.tasks.celery_app import celery_app


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(
    self,
    to_email: str,
    subject: str,
    html_body: str,
    log_id: Optional[str] = None,
):
    try:
        _run_async(_send_email_async(to_email, subject, html_body, log_id))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _send_email_async(to_email: str, subject: str, html_body: str, log_id: Optional[str]):
    from app.database import AsyncSessionLocal
    from app.services.email_service import EmailService
    from app.core.security import decrypt_field
    from app.config import settings

    async with AsyncSessionLocal() as db:
        svc = EmailService(db)
        smtp_cfg = await svc.get_smtp_config()
        if not smtp_cfg:
            if log_id:
                await _mark_log_failed(db, log_id, "SMTP yapılandırması yok.")
            return

        password = decrypt_field(smtp_cfg.password_encrypted, settings.SMTP_ENCRYPTION_KEY)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{smtp_cfg.from_name} <{smtp_cfg.from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        try:
            if smtp_cfg.use_tls:
                context = ssl_lib.create_default_context()
                with smtplib.SMTP(smtp_cfg.host, smtp_cfg.port) as server:
                    server.starttls(context=context)
                    server.login(smtp_cfg.username, password)
                    server.sendmail(smtp_cfg.from_email, [to_email], msg.as_string())
            else:
                with smtplib.SMTP(smtp_cfg.host, smtp_cfg.port) as server:
                    server.login(smtp_cfg.username, password)
                    server.sendmail(smtp_cfg.from_email, [to_email], msg.as_string())

            if log_id:
                await _mark_log_sent(db, log_id)
        except Exception as e:
            if log_id:
                await _mark_log_failed(db, log_id, str(e))
            raise
        await db.commit()


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


@celery_app.task(bind=True, max_retries=2)
def send_teams_message_task(
    self,
    webhook_id: str,
    title: str,
    body: str,
    action_url: Optional[str] = None,
):
    try:
        _run_async(_send_teams_async(webhook_id, title, body, action_url))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _send_teams_async(webhook_id: str, title: str, body: str, action_url: Optional[str]):
    import uuid
    from app.database import AsyncSessionLocal
    from app.services.teams_service import TeamsService
    async with AsyncSessionLocal() as db:
        svc = TeamsService(db)
        await svc.send_message(uuid.UUID(webhook_id), title, body, action_url)
        await db.commit()


@celery_app.task
def evaluate_scheduled_workflows():
    _run_async(_evaluate_workflows_async())


async def _evaluate_workflows_async():
    from app.database import AsyncSessionLocal
    from sqlalchemy import select
    from app.models.email_workflow import EmailWorkflow
    from app.models.kanban import Task
    from app.models.user import User

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(EmailWorkflow).where(EmailWorkflow.is_active == True)
        )
        workflows = result.scalars().all()

        today = date.today()
        now = datetime.now(timezone.utc)

        for wf in workflows:
            if wf.trigger_type == "task_due_soon":
                days_before = (wf.trigger_config or {}).get("days_before", 3)
                target_date = today + timedelta(days=days_before)
                await _handle_task_due_soon(db, wf, target_date)

            elif wf.trigger_type == "task_overdue":
                await _handle_task_overdue(db, wf, today)

            elif wf.trigger_type == "worklog_reminder":
                hour = (wf.trigger_config or {}).get("send_hour", 17)
                if now.hour == hour:
                    await _handle_worklog_reminder(db, wf, today)

            wf.last_run_at = now

        await db.commit()


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

        send_email_task.delay(
            to_email=task.assignee.email,
            subject=subject,
            html_body=html,
            log_id=str(log.id),
        )

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

        send_email_task.delay(
            to_email=task.assignee.email,
            subject=subject,
            html_body=html,
            log_id=str(log.id),
        )


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

        send_email_task.delay(
            to_email=user.email,
            subject=subject,
            html_body=html,
            log_id=str(log.id),
        )


@celery_app.task
def refresh_jira_statuses():
    _run_async(_refresh_jira_async())


async def _refresh_jira_async():
    from app.database import AsyncSessionLocal
    from app.services.jira_service import JiraService
    async with AsyncSessionLocal() as db:
        svc = JiraService(db)
        await svc.bulk_refresh_jira_statuses()
        await db.commit()
