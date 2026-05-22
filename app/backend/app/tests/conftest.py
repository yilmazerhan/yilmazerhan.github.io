import asyncio
import pytest
import pytest_asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.database import Base, get_db
from app.config import settings


TEST_DATABASE_URL = settings.DATABASE_URL.replace("/teamapp", "/teamapp_test")

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session")
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db(setup_db) -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.rollback()
        except Exception:
            await session.rollback()
            raise


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def superadmin_user(db: AsyncSession):
    from app.models.user import User
    from app.core.security import hash_password
    user = User(
        email="admin@test.com",
        hashed_password=hash_password("Admin123!"),
        full_name="Super Admin",
        role="superadmin",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def regular_user(db: AsyncSession):
    from app.models.user import User
    from app.core.security import hash_password
    user = User(
        email="user@test.com",
        hashed_password=hash_password("User123!"),
        full_name="Regular User",
        role="user",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def manager_user(db: AsyncSession):
    from app.models.user import User
    from app.core.security import hash_password
    user = User(
        email="manager@test.com",
        hashed_password=hash_password("Manager123!"),
        full_name="Team Manager",
        role="team_manager",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def get_auth_headers(client: AsyncClient, email: str, password: str) -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
