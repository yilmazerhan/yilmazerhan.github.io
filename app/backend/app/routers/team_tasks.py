import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.team_task import TeamTaskCreate, TeamTaskUpdate, TeamTaskResponse
from app.schemas.auth import MessageResponse
from app.services.team_task_service import TeamTaskService
from app.services.notification_service import NotificationService
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
    task = await svc.create_task(body.model_dump(), created_by=current_user.id)
    notif_svc = NotificationService(db)
    for assignee in task.assignees:
        if assignee.user_id != current_user.id:
            await notif_svc.create(
                user_id=assignee.user_id,
                type="task_assigned",
                title=f"Yeni görev atandı: {task.title}",
                body=f"Son tarih: {task.deadline}",
                link="/team-tasks",
            )
    return task


@router.patch("/{task_id}", response_model=TeamTaskResponse)
async def update_team_task(
    task_id: uuid.UUID,
    body: TeamTaskUpdate,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamTaskService(db)
    old_task = await svc.get_task(task_id)

    if current_user.role != 'superadmin' and old_task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Bu görevi düzenlemek için yetkiniz yok.")

    old_assignee_ids = {a.user_id for a in old_task.assignees}

    body_dict = body.model_dump(exclude_none=True)
    task = await svc.update_task(task_id, body_dict)

    new_assignee_ids_raw = body_dict.get("assignee_ids")
    if new_assignee_ids_raw is not None:
        new_assignee_ids = {a.user_id for a in task.assignees}
        added_ids = new_assignee_ids - old_assignee_ids
        notif_svc = NotificationService(db)
        for assignee in task.assignees:
            if assignee.user_id in added_ids and assignee.user_id != current_user.id:
                await notif_svc.create(
                    user_id=assignee.user_id,
                    type="task_assigned",
                    title=f"Yeni görev atandı: {task.title}",
                    body=f"Son tarih: {task.deadline}",
                    link="/team-tasks",
                )
    return task


@router.patch("/{task_id}/complete", response_model=TeamTaskResponse)
async def toggle_my_completion(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamTaskService(db)
    return await svc.toggle_complete(task_id, current_user.id)


@router.delete("/{task_id}", response_model=MessageResponse)
async def delete_team_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamTaskService(db)
    task = await svc.get_task(task_id)
    if current_user.role != 'superadmin' and task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Bu görevi silmek için yetkiniz yok.")
    await svc.delete_task(task_id)
    return {"message": "Takım görevi silindi."}
