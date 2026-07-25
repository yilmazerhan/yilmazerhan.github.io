import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.team import (
    TeamCreate, TeamUpdate, TeamResponse, TeamDetailResponse,
    TeamListResponse, AddMemberRequest
)
from app.schemas.user import UserResponse
from app.schemas.auth import MessageResponse
from app.services.team_service import TeamService
from app.core.dependencies import get_current_user, require_superadmin, require_manager_or_above
from app.core.exceptions import ForbiddenError

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=TeamListResponse)
async def list_teams(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    svc = TeamService(db)
    items, total = await svc.list_teams(requester=current_user, is_active=is_active, skip=skip, limit=limit)
    return_items = []
    for team in items:
        data = TeamResponse.model_validate(team)
        data.member_count = len(team.members) if hasattr(team, "members") and team.members else 0
        return_items.append(data)
    return {"items": return_items, "total": total}


@router.post("", response_model=TeamResponse, status_code=201)
async def create_team(
    body: TeamCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamService(db)
    team = await svc.create_team(body.name, body.description, body.manager_id)
    return team


@router.get("/{team_id}", response_model=TeamDetailResponse)
async def get_team(
    team_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamService(db)
    team = await svc.get_by_id(team_id)
    # A team_manager may only view teams they belong to; superadmin sees all.
    if current_user.role == "team_manager":
        member_ids = {m.id for m in team.members}
        if current_user.id not in member_ids and team.manager_id != current_user.id:
            raise ForbiddenError("Bu takıma erişim yetkiniz yok.")
    data = TeamDetailResponse.model_validate(team)
    data.member_count = len(team.members)
    data.members = team.members
    return data


@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: uuid.UUID,
    body: TeamUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamService(db)
    team = await svc.update_team(
        team_id=team_id,
        name=body.name,
        description=body.description,
        manager_id=body.manager_id,
        is_active=body.is_active,
    )
    return team


@router.delete("/{team_id}", response_model=MessageResponse)
async def delete_team(
    team_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = TeamService(db)
    await svc.delete_team(team_id)
    return {"message": "Takım başarıyla silindi."}


@router.post("/{team_id}/members", response_model=UserResponse)
async def add_member(
    team_id: uuid.UUID,
    body: AddMemberRequest,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Superadmin-only: the user_teams junction table is the authoritative ACL for
    # nearly every tenant boundary in the app (worklogs, leaves, kanban boards,
    # user edits, password resets, reports, exports). Letting a team_manager
    # insert arbitrary users into their own team would let them expand their own
    # authorization scope at will. Team create/update/delete are already
    # superadmin-only, and the Teams UI is a superadmin-only route.
    svc = TeamService(db)
    return await svc.add_member(team_id, body.user_id)


@router.delete("/{team_id}/members/{user_id}", response_model=MessageResponse)
async def remove_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Superadmin-only for the same reason as add_member above.
    svc = TeamService(db)
    await svc.remove_member(team_id, user_id, current_user)
    return {"message": "Üye takımdan çıkarıldı."}
