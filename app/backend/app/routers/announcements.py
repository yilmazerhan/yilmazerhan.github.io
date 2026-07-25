import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.user_team import user_teams
from app.models.announcement import Announcement
from app.schemas.announcement import AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse
from app.core.dependencies import get_current_user, require_superadmin
from app.core.exceptions import NotFoundError

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("/active", response_model=list[AnnouncementResponse])
async def get_active_announcements(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return announcements visible to the current user right now."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Announcement).where(
            Announcement.is_active == True,
            Announcement.starts_at <= now,
        )
    )
    all_active = result.scalars().all()

    # All teams the viewer actually belongs to (junction table is authoritative).
    my_team_ids = {
        str(t) for t in (await db.execute(
            select(user_teams.c.team_id).where(user_teams.c.user_id == current_user.id)
        )).scalars().all()
    }

    visible = []
    for ann in all_active:
        # Check expiry
        if ann.ends_at and ann.ends_at < now:
            continue
        # Check targeting
        if ann.target_type == "all":
            visible.append(ann)
        elif ann.target_type == "specific_users":
            ids = [str(i) for i in (ann.target_ids or [])]
            if str(current_user.id) in ids:
                visible.append(ann)
        elif ann.target_type == "specific_teams":
            # Resolve ALL of the viewer's teams from the junction table. Using the
            # single stale users.team_id pointer showed team-A announcements to
            # users who had moved to team B, hid team-B ones from them, and only
            # ever matched one team for multi-team users.
            if my_team_ids & {str(i) for i in (ann.target_ids or [])}:
                visible.append(ann)

    return visible


@router.get("", response_model=list[AnnouncementResponse])
async def list_announcements(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Announcement).order_by(Announcement.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=AnnouncementResponse, status_code=201)
async def create_announcement(
    body: AnnouncementCreate,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ann = Announcement(
        title=body.title,
        title_en=body.title_en or None,
        message=body.message,
        message_en=body.message_en or None,
        type=body.type,
        target_type=body.target_type,
        # target_ids is a JSONB column — store UUIDs as strings so they serialize.
        target_ids=[str(i) for i in body.target_ids] if body.target_ids else body.target_ids,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        is_active=body.is_active,
        created_by=current_user.id,
    )
    db.add(ann)
    await db.flush()
    await db.refresh(ann)
    return ann


@router.patch("/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: uuid.UUID,
    body: AnnouncementUpdate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise NotFoundError("Duyuru")

    if body.title is not None: ann.title = body.title
    if body.title_en is not None: ann.title_en = body.title_en or None
    if body.message is not None: ann.message = body.message
    if body.message_en is not None: ann.message_en = body.message_en or None
    if body.type is not None: ann.type = body.type
    if body.target_type is not None: ann.target_type = body.target_type
    if body.target_ids is not None: ann.target_ids = [str(i) for i in body.target_ids]
    if body.starts_at is not None: ann.starts_at = body.starts_at
    if body.ends_at is not None: ann.ends_at = body.ends_at
    if body.is_active is not None: ann.is_active = body.is_active

    await db.flush()
    await db.refresh(ann)
    return ann


@router.delete("/{announcement_id}", status_code=204)
async def delete_announcement(
    announcement_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise NotFoundError("Duyuru")
    await db.delete(ann)
    await db.flush()
