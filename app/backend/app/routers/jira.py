import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.jira import (
    JiraConfigCreate, JiraConfigUpdate, JiraConfigResponse, JiraConnectionTestResponse
)
from app.schemas.auth import MessageResponse
from app.services.jira_service import JiraService
from app.core.dependencies import get_current_user, require_superadmin

router = APIRouter(prefix="/jira", tags=["jira"])


@router.get("/configs", response_model=list[JiraConfigResponse])
async def list_configs(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = JiraService(db)
    return await svc.list_configs()


@router.post("/configs", response_model=JiraConfigResponse, status_code=201)
async def create_config(
    body: JiraConfigCreate,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = JiraService(db)
    return await svc.create_config(
        name=body.name,
        base_url=body.base_url,
        email=body.email,
        api_token=body.api_token,
        project_key=body.project_key,
        created_by=current_user.id,
    )


@router.patch("/configs/{config_id}", response_model=JiraConfigResponse)
async def update_config(
    config_id: uuid.UUID,
    body: JiraConfigUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = JiraService(db)
    return await svc.update_config(
        config_id,
        name=body.name,
        base_url=body.base_url,
        email=body.email,
        api_token=body.api_token,
        project_key=body.project_key,
        is_active=body.is_active,
    )


@router.delete("/configs/{config_id}", response_model=MessageResponse)
async def delete_config(
    config_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = JiraService(db)
    await svc.delete_config(config_id)
    return {"message": "Jira yapılandırması silindi."}


@router.post("/configs/{config_id}/test", response_model=JiraConnectionTestResponse)
async def test_connection(
    config_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = JiraService(db)
    return await svc.test_connection(config_id)


@router.post("/tasks/{task_id}/refresh-jira", response_model=MessageResponse)
async def refresh_task_jira(
    task_id: uuid.UUID,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = JiraService(db)
    await svc.refresh_task_jira_status(task_id)
    return {"message": "Jira durumu güncellendi."}


@router.post("/bulk-refresh", response_model=dict)
async def bulk_refresh(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = JiraService(db)
    updated = await svc.bulk_refresh_jira_statuses()
    return {"updated": updated}
