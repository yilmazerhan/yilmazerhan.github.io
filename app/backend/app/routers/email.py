import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.email import (
    SmtpConfigCreate, SmtpConfigUpdate, SmtpConfigResponse,
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse, EmailTemplatePreviewRequest,
    EmailWorkflowCreate, EmailWorkflowUpdate, EmailWorkflowResponse,
    EmailLogResponse, EmailLogListResponse,
    TeamsWebhookCreate, TeamsWebhookUpdate, TeamsWebhookResponse,
)
from app.schemas.auth import MessageResponse
from app.services.email_service import EmailService
from app.services.teams_service import TeamsService
from app.core.dependencies import get_current_user, require_superadmin, require_manager_or_above

router = APIRouter(prefix="/email", tags=["email"])


# ─── SMTP ─────────────────────────────────────────────────────────────────────

@router.get("/smtp", response_model=list[SmtpConfigResponse])
async def list_smtp(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.list_smtp_configs()


@router.post("/smtp", response_model=SmtpConfigResponse, status_code=201)
async def create_smtp(
    body: SmtpConfigCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.create_smtp_config(
        host=body.host, port=body.port, username=body.username,
        password=body.password, use_tls=body.use_tls,
        from_email=body.from_email, from_name=body.from_name,
    )


@router.patch("/smtp/{config_id}", response_model=SmtpConfigResponse)
async def update_smtp(
    config_id: uuid.UUID,
    body: SmtpConfigUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.update_smtp_config(
        config_id, host=body.host, port=body.port, username=body.username,
        password=body.password, use_tls=body.use_tls,
        from_email=body.from_email, from_name=body.from_name, is_active=body.is_active,
    )


@router.post("/smtp/{config_id}/test", response_model=dict)
async def test_smtp(
    config_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send a test email via the given SMTP configuration."""
    svc = EmailService(db)
    result = await svc.test_smtp_config(config_id, to_email=current_user.email)
    return result


# ─── Templates ────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[EmailTemplateResponse])
async def list_templates(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.list_templates()


@router.post("/templates", response_model=EmailTemplateResponse, status_code=201)
async def create_template(
    body: EmailTemplateCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.create_template(
        name=body.name, slug=body.slug, subject=body.subject,
        html_body=body.html_body, available_vars=body.available_vars,
    )


@router.patch("/templates/{template_id}", response_model=EmailTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    body: EmailTemplateUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.update_template(
        template_id, name=body.name, subject=body.subject,
        html_body=body.html_body, available_vars=body.available_vars,
    )


@router.delete("/templates/{template_id}", response_model=MessageResponse)
async def delete_template(
    template_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    await svc.delete_template(template_id)
    return {"message": "Şablon silindi."}


@router.post("/templates/{template_id}/preview")
async def preview_template(
    template_id: uuid.UUID,
    body: EmailTemplatePreviewRequest,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    html = await svc.preview_template(template_id, body.variables)
    return {"html": html}


# ─── Workflows ────────────────────────────────────────────────────────────────

@router.get("/workflows", response_model=list[EmailWorkflowResponse])
async def list_workflows(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.list_workflows()


@router.post("/workflows", response_model=EmailWorkflowResponse, status_code=201)
async def create_workflow(
    body: EmailWorkflowCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.create_workflow(
        name=body.name,
        trigger_type=body.trigger_type,
        template_id=body.template_id,
        recipient_type=body.recipient_type,
        trigger_config=body.trigger_config,
        condition_config=body.condition_config,
        recipient_users=body.recipient_users,
        send_teams=body.send_teams,
        teams_webhook_id=body.teams_webhook_id,
    )


@router.patch("/workflows/{workflow_id}", response_model=EmailWorkflowResponse)
async def update_workflow(
    workflow_id: uuid.UUID,
    body: EmailWorkflowUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.update_workflow(
        workflow_id,
        name=body.name,
        trigger_config=body.trigger_config,
        condition_config=body.condition_config,
        template_id=body.template_id,
        recipient_type=body.recipient_type,
        recipient_users=body.recipient_users,
        send_teams=body.send_teams,
        teams_webhook_id=body.teams_webhook_id,
        is_active=body.is_active,
    )


@router.patch("/workflows/{workflow_id}/toggle", response_model=EmailWorkflowResponse)
async def toggle_workflow(
    workflow_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    return await svc.toggle_workflow(workflow_id)


@router.delete("/workflows/{workflow_id}", response_model=MessageResponse)
async def delete_workflow(
    workflow_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = EmailService(db)
    await svc.delete_workflow(workflow_id)
    return {"message": "İş akışı silindi."}


@router.post("/workflows/{workflow_id}/test-run", response_model=MessageResponse)
async def test_run_workflow(
    workflow_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.tasks.email_tasks import evaluate_scheduled_workflows
    evaluate_scheduled_workflows.delay()
    return {"message": "İş akışı kuyruğa alındı."}


# ─── Logs ─────────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=EmailLogListResponse)
async def list_logs(
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    svc = EmailService(db)
    items, total = await svc.list_logs(skip=skip, limit=limit, status=status)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ─── Teams Webhooks ───────────────────────────────────────────────────────────

@router.get("/teams-webhooks", response_model=list[TeamsWebhookResponse])
async def list_teams_webhooks(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamsService(db)
    return await svc.list_webhooks()


@router.post("/teams-webhooks", response_model=TeamsWebhookResponse, status_code=201)
async def create_teams_webhook(
    body: TeamsWebhookCreate,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamsService(db)
    return await svc.create_webhook(body.name, body.webhook_url, current_user.id)


@router.patch("/teams-webhooks/{webhook_id}", response_model=TeamsWebhookResponse)
async def update_teams_webhook(
    webhook_id: uuid.UUID,
    body: TeamsWebhookUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamsService(db)
    return await svc.update_webhook(webhook_id, body.name, body.webhook_url, body.is_active)


@router.delete("/teams-webhooks/{webhook_id}", response_model=MessageResponse)
async def delete_teams_webhook(
    webhook_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamsService(db)
    await svc.delete_webhook(webhook_id)
    return {"message": "Teams webhook silindi."}


@router.post("/teams-webhooks/{webhook_id}/test", response_model=dict)
async def test_teams_webhook(
    webhook_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamsService(db)
    return await svc.test_webhook(webhook_id)
