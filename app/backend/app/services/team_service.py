import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.orm import selectinload
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.team import Team
from app.models.user import User
from app.models.user_team import user_teams
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
            # Show all teams the manager belongs to (via junction table)
            query = query.join(user_teams, Team.id == user_teams.c.team_id).where(
                user_teams.c.user_id == requester.id
            )

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
                # Also ensure they are in junction table
                await self.db.execute(
                    pg_insert(user_teams)
                    .values(user_id=manager_id, team_id=team_id)
                    .on_conflict_do_nothing()
                )
        if is_active is not None:
            team.is_active = is_active

        await self.db.flush()
        return team

    async def delete_team(self, team_id: uuid.UUID) -> None:
        team = await self.get_by_id(team_id)
        # Check for members in the junction table
        count_result = await self.db.execute(
            select(func.count()).where(user_teams.c.team_id == team_id)
        )
        if count_result.scalar_one() > 0:
            raise ValidationError("Takımda üyeler var. Önce üyeleri başka bir takıma taşıyın.")
        await self.db.delete(team)
        await self.db.flush()

    async def add_member(self, team_id: uuid.UUID, user_id: uuid.UUID) -> User:
        # Verify team exists
        team_check = await self.db.execute(select(Team).where(Team.id == team_id))
        if not team_check.scalar_one_or_none():
            raise NotFoundError("Takım")

        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Kullanıcı")

        # Insert into junction table (idempotent)
        await self.db.execute(
            pg_insert(user_teams)
            .values(user_id=user_id, team_id=team_id)
            .on_conflict_do_nothing()
        )

        # Set primary team_id if not yet assigned
        if user.team_id is None:
            user.team_id = team_id

        await self.db.flush()

        # Re-query with eager-loaded relationships for serialization
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.team))
            .where(User.id == user_id)
        )
        return result.scalar_one()

    async def remove_member(self, team_id: uuid.UUID, user_id: uuid.UUID, requester: User) -> None:
        # Check user is in this team via junction table
        in_team = await self.db.execute(
            select(user_teams.c.user_id).where(
                user_teams.c.user_id == user_id,
                user_teams.c.team_id == team_id,
            )
        )
        if not in_team.scalar_one_or_none():
            raise NotFoundError("Takım üyesi")

        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Kullanıcı")

        if user.id == requester.id:
            raise ForbiddenError("Kendinizi takımdan çıkaramazsınız.")

        # Remove from junction table
        await self.db.execute(
            sa_delete(user_teams).where(
                user_teams.c.user_id == user_id,
                user_teams.c.team_id == team_id,
            )
        )

        # Update primary team_id if it was this team
        if user.team_id == team_id:
            # Try to find another team membership
            next_team_row = await self.db.execute(
                select(user_teams.c.team_id)
                .where(user_teams.c.user_id == user_id)
                .limit(1)
            )
            user.team_id = next_team_row.scalar_one_or_none()

        await self.db.flush()

    async def _validate_manager(self, manager_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(User).where(User.id == manager_id, User.is_deleted == False, User.is_active == True)
        )
        if not result.scalar_one_or_none():
            raise NotFoundError("Yönetici kullanıcı")
