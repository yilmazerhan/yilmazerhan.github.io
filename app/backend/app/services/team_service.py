import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.team import Team
from app.models.user import User
from app.core.exceptions import ConflictError, NotFoundError, ForbiddenError, ValidationError


class TeamService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, team_id: uuid.UUID) -> Team:
        result = await self.db.execute(
            select(Team)
            .options(selectinload(Team.members), selectinload(Team.manager))
            .where(Team.id == team_id)
        )
        team = result.scalar_one_or_none()
        if not team:
            raise NotFoundError("Takım")
        return team

    async def list_teams(
        self,
        requester: User,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Team], int]:
        query = select(Team).options(selectinload(Team.manager))

        if requester.role == "team_manager":
            query = query.where(Team.id == requester.team_id)

        if is_active is not None:
            query = query.where(Team.is_active == is_active)

        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            query.offset(skip).limit(limit).order_by(Team.name)
        )
        return list(result.scalars().all()), total

    async def create_team(
        self,
        name: str,
        description: Optional[str] = None,
        manager_id: Optional[uuid.UUID] = None,
    ) -> Team:
        result = await self.db.execute(select(Team).where(Team.name == name))
        if result.scalar_one_or_none():
            raise ConflictError("Bu isimde bir takım zaten mevcut.")

        if manager_id:
            await self._validate_manager(manager_id)

        team = Team(name=name, description=description, manager_id=manager_id)
        self.db.add(team)
        await self.db.flush()
        return team

    async def update_team(
        self,
        team_id: uuid.UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        manager_id: Optional[uuid.UUID] = None,
        is_active: Optional[bool] = None,
    ) -> Team:
        team = await self.get_by_id(team_id)

        if name and name != team.name:
            exists = await self.db.execute(select(Team).where(Team.name == name))
            if exists.scalar_one_or_none():
                raise ConflictError("Bu isimde bir takım zaten mevcut.")
            team.name = name
        if description is not None:
            team.description = description
        if manager_id is not None:
            await self._validate_manager(manager_id)
            team.manager_id = manager_id
            # Set manager's team_id and role
            result = await self.db.execute(select(User).where(User.id == manager_id))
            manager = result.scalar_one_or_none()
            if manager:
                manager.team_id = team_id
                if manager.role == "user":
                    manager.role = "team_manager"
        if is_active is not None:
            team.is_active = is_active

        await self.db.flush()
        return team

    async def delete_team(self, team_id: uuid.UUID) -> None:
        team = await self.get_by_id(team_id)
        # Check for members
        count_result = await self.db.execute(
            select(func.count()).where(User.team_id == team_id, User.is_deleted == False)
        )
        if count_result.scalar_one() > 0:
            raise ValidationError("Takımda üyeler var. Önce üyeleri başka bir takıma taşıyın.")
        await self.db.delete(team)
        await self.db.flush()

    async def add_member(self, team_id: uuid.UUID, user_id: uuid.UUID) -> User:
        team = await self.get_by_id(team_id)
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Kullanıcı")
        user.team_id = team_id
        await self.db.flush()
        return user

    async def remove_member(self, team_id: uuid.UUID, user_id: uuid.UUID, requester: User) -> None:
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.team_id == team_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Takım üyesi")
        if user.id == requester.id:
            raise ForbiddenError("Kendinizi takımdan çıkaramazsınız.")
        user.team_id = None
        await self.db.flush()

    async def _validate_manager(self, manager_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(User).where(User.id == manager_id, User.is_deleted == False, User.is_active == True)
        )
        if not result.scalar_one_or_none():
            raise NotFoundError("Yönetici kullanıcı")
