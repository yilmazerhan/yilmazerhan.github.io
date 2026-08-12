import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.release import Release, ReleasePhase, ReleaseMilestone
from app.core.exceptions import NotFoundError


class ReleaseService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Releases ──────────────────────────────────────────────────────────

    async def list_releases(self) -> list[Release]:
        result = await self.db.execute(
            select(Release).order_by(Release.display_order, Release.created_at)
        )
        return list(result.scalars().all())

    async def get_release(self, release_id: uuid.UUID) -> Release:
        result = await self.db.execute(
            select(Release)
            .options(selectinload(Release.phases), selectinload(Release.milestones))
            .where(Release.id == release_id)
        )
        rel = result.scalar_one_or_none()
        if not rel:
            raise NotFoundError("Release")
        return rel

    async def create_release(self, **kwargs) -> Release:
        rel = Release(**kwargs)
        self.db.add(rel)
        await self.db.flush()
        return await self.get_release(rel.id)

    async def update_release(self, release_id: uuid.UUID, **kwargs) -> Release:
        rel = await self.get_release(release_id)
        for k, v in kwargs.items():
            setattr(rel, k, v)
        await self.db.flush()
        return await self.get_release(release_id)

    async def delete_release(self, release_id: uuid.UUID) -> None:
        rel = await self.get_release(release_id)
        await self.db.delete(rel)
        await self.db.flush()

    # ─── Phases ────────────────────────────────────────────────────────────

    async def get_phase(self, phase_id: uuid.UUID) -> ReleasePhase:
        result = await self.db.execute(select(ReleasePhase).where(ReleasePhase.id == phase_id))
        phase = result.scalar_one_or_none()
        if not phase:
            raise NotFoundError("Aşama")
        return phase

    async def add_phase(self, release_id: uuid.UUID, **kwargs) -> ReleasePhase:
        await self.get_release(release_id)
        phase = ReleasePhase(release_id=release_id, **kwargs)
        self.db.add(phase)
        await self.db.flush()
        return phase

    async def update_phase(self, phase_id: uuid.UUID, **kwargs) -> ReleasePhase:
        phase = await self.get_phase(phase_id)
        for k, v in kwargs.items():
            setattr(phase, k, v)
        if phase.end_date < phase.start_date:
            from app.core.exceptions import ValidationError
            raise ValidationError("Bitiş tarihi başlangıç tarihinden önce olamaz.")
        await self.db.flush()
        return phase

    async def delete_phase(self, phase_id: uuid.UUID) -> None:
        phase = await self.get_phase(phase_id)
        await self.db.delete(phase)
        await self.db.flush()

    # ─── Milestones ────────────────────────────────────────────────────────

    async def get_milestone(self, milestone_id: uuid.UUID) -> ReleaseMilestone:
        result = await self.db.execute(
            select(ReleaseMilestone).where(ReleaseMilestone.id == milestone_id)
        )
        ms = result.scalar_one_or_none()
        if not ms:
            raise NotFoundError("Kilometre taşı")
        return ms

    async def add_milestone(self, release_id: uuid.UUID, **kwargs) -> ReleaseMilestone:
        await self.get_release(release_id)
        ms = ReleaseMilestone(release_id=release_id, **kwargs)
        self.db.add(ms)
        await self.db.flush()
        return ms

    async def update_milestone(self, milestone_id: uuid.UUID, **kwargs) -> ReleaseMilestone:
        ms = await self.get_milestone(milestone_id)
        for k, v in kwargs.items():
            setattr(ms, k, v)
        await self.db.flush()
        return ms

    async def delete_milestone(self, milestone_id: uuid.UUID) -> None:
        ms = await self.get_milestone(milestone_id)
        await self.db.delete(ms)
        await self.db.flush()
