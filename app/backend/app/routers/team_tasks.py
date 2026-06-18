import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.team_task import TeamTaskCreate, TeamTaskUpdate, TeamTaskResponse
from app.schemas.auth import MessageResponse
from app.services.team_task_service import TeamTaskService
from app.core.dependencies import get_current_user, require_manager_or_above

router = APIRouter(prefix="/team-tasks", tags=["team-tasks"])


@router.get("", response_model=list[TeamTaskResponse])
async def list_team_tasks(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamTaskService(db)
    return await svc.list_tasks()


@router.post("", response_model=TeamTaskResponse, status_code=201)
async def create_team_task(
    body: TeamTaskCreate,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamTaskService(db)
    return await svc.create_task(body.model_dump(), created_by=current_user.id)


@router.patch("/{task_id}", response_model=TeamTaskResponse)
async def update_team_task(
    task_id: uuid.UUID,
    body: TeamTaskUpdate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamTaskService(db)
    return await svc.update_task(task_id, body.model_dump(exclude_none=True))


@router.delete("/{task_id}", response_model=MessageResponse)
async def delete_team_task(
    task_id: uuid.UUID,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamTaskService(db)
    await svc.delete_task(task_id)
    return {"message": "Takım görevi silindi."}
