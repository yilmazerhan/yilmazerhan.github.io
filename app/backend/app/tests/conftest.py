import asyncio
import pytest
import pytest_asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Import app first so all models register with Base.metadata
from app.main import app
from app.database import Base, get_db
from app.config import settings

TEST_DATABASE_URL = settings.DATABASE_URL.replace("/teamapp", "/teamapp_test")


# ---------------------------------------------------------------------------
# Schema setup — runs once per session in a DEDICATED loop so it doesn't
# contaminate the per-test event loops that pytest-asyncio creates.
# ---------------------------------------------------------------------------
async def _create_test_schema():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO admin"))
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """Create the test schema synchronously (new dedicated loop)."""
    loop = asyncio.new_event_loop()
    loop.run_until_complete(_create_test_schema())
    loop.close()
    yield


# ---------------------------------------------------------------------------
# Per-test DB session.
# A fresh engine is created per test so every asyncpg connection lives in
# the SAME event loop as the test function — avoiding "Future attached to a
# different loop" errors caused by sharing connections across loops.
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def db(setup_db) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        try:
            yield session
            await session.rollback()
        except Exception:
            await session.rollback()
            raise
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def superadmin_user(db: AsyncSession):
    from app.models.user import User
    from app.core.security import hash_password
    user = User(
        email="admin@test.com",
        username="admin.test",
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
        username="user.test",
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
        username="manager.test",
        hashed_password=hash_password("Manager123!"),
        full_name="Team Manager",
        role="team_manager",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------
async def get_auth_headers(client: AsyncClient, email: str, password: str) -> dict:
    """Log in and return Bearer auth headers.

    The login endpoint uses `username` (not email).  Fixture users have
    usernames derived from the email local-part with dots kept as-is.
    For ad-hoc users created in tests, pass the username directly via the
    `email` parameter (it's treated as the username when not in the map).
    """
    _username_map = {
        "admin@test.com": "admin.test",
        "user@test.com": "user.test",
        "manager@test.com": "manager.test",
    }
    username = _username_map.get(email, email.split("@")[0].replace(".", "_"))
    resp = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
