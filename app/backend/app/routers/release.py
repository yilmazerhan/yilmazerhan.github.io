import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.release import (
    ReleaseCreate, ReleaseUpdate, ReleaseResponse,
    PhaseCreate, PhaseUpdate, PhaseResponse,
    MilestoneCreate, MilestoneUpdate, MilestoneResponse,
)
from app.schemas.auth import MessageResponse
from app.services.release_service import ReleaseService
from app.core.dependencies import get_current_user, require_manager_or_above

router = APIRouter(prefix="/releases", tags=["releases"])


# ─── Releases ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ReleaseResponse])
async def list_releases(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await ReleaseService(db).list_releases()


@router.post("", response_model=ReleaseResponse, status_code=201)
async def create_release(
    body: ReleaseCreate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await ReleaseService(db).create_release(**body.model_dump())


@router.patch("/{release_id}", response_model=ReleaseResponse)
async def update_release(
    release_id: uuid.UUID,
    body: ReleaseUpdate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await ReleaseService(db).update_release(release_id, **body.model_dump(exclude_unset=True))


@router.delete("/{release_id}", response_model=MessageResponse)
async def delete_release(
    release_id: uuid.UUID,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await ReleaseService(db).delete_release(release_id)
    return {"message": "Release silindi."}


# ─── Phases ──────────────────────────────────────────────────────────────────

@router.post("/{release_id}/phases", response_model=PhaseResponse, status_code=201)
async def add_phase(
    release_id: uuid.UUID,
    body: PhaseCreate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await ReleaseService(db).add_phase(release_id, **body.model_dump())


@router.patch("/{release_id}/phases/{phase_id}", response_model=PhaseResponse)
async def update_phase(
    release_id: uuid.UUID,
    phase_id: uuid.UUID,
    body: PhaseUpdate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await ReleaseService(db).update_phase(phase_id, **body.model_dump(exclude_unset=True))


@router.delete("/{release_id}/phases/{phase_id}", response_model=MessageResponse)
async def delete_phase(
    release_id: uuid.UUID,
    phase_id: uuid.UUID,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await ReleaseService(db).delete_phase(phase_id)
    return {"message": "Aşama silindi."}


# ─── Milestones ──────────────────────────────────────────────────────────────

@router.post("/{release_id}/milestones", response_model=MilestoneResponse, status_code=201)
async def add_milestone(
    release_id: uuid.UUID,
    body: MilestoneCreate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await ReleaseService(db).add_milestone(release_id, **body.model_dump())


@router.patch("/{release_id}/milestones/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(
    release_id: uuid.UUID,
    milestone_id: uuid.UUID,
    body: MilestoneUpdate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await ReleaseService(db).update_milestone(milestone_id, **body.model_dump(exclude_unset=True))


@router.delete("/{release_id}/milestones/{milestone_id}", response_model=MessageResponse)
async def delete_milestone(
    release_id: uuid.UUID,
    milestone_id: uuid.UUID,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await ReleaseService(db).delete_milestone(milestone_id)
    return {"message": "Kilometre taşı silindi."}
