from fastapi import Request
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=settings.is_development,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db(request: Request) -> AsyncSession:
    # The session is owned by DBSessionMiddleware, which commits before the
    # response is dispatched (FastAPI runs dependency teardown *after* send,
    # which would otherwise race an immediate read-after-write). Create it
    # lazily so requests that don't touch the DB don't check out a connection.
    if getattr(request.state, "db", None) is None:
        request.state.db = AsyncSessionLocal()
    yield request.state.db
