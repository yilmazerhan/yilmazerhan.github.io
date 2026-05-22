from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.worklog import WorkType
from app.models.kanban import KanbanColumn
from app.models.app_setting import AppSetting
from app.core.security import hash_password
from app.config import settings


DEFAULT_WORK_TYPES = [
    {"name": "Müşteri Toplantısı", "color": "#3b82f6", "sort_order": 1},
    {"name": "Sunum Hazırlığı", "color": "#8b5cf6", "sort_order": 2},
    {"name": "Production Bug İncelemesi", "color": "#ef4444", "sort_order": 3},
    {"name": "Analiz", "color": "#f59e0b", "sort_order": 4},
    {"name": "Geliştirme", "color": "#10b981", "sort_order": 5},
    {"name": "Test", "color": "#06b6d4", "sort_order": 6},
    {"name": "Release Testi", "color": "#f97316", "sort_order": 7},
    {"name": "Dokümantasyon", "color": "#6366f1", "sort_order": 8},
    {"name": "Code Review", "color": "#84cc16", "sort_order": 9},
    {"name": "Eğitim / Araştırma", "color": "#ec4899", "sort_order": 10},
]

DEFAULT_KANBAN_COLUMNS = [
    {"name": "Bekleyen", "color": "#e2e8f0", "sort_order": 0, "is_terminal": False},
    {"name": "Devam Ediyor", "color": "#bfdbfe", "sort_order": 1, "is_terminal": False},
    {"name": "İncelemede", "color": "#fef9c3", "sort_order": 2, "is_terminal": False},
    {"name": "Tamamlandı", "color": "#bbf7d0", "sort_order": 3, "is_terminal": True},
]

DEFAULT_APP_SETTINGS = {
    "company_name": "Şirket Adı",
    "company_logo": "",
    "primary_color": "#3b82f6",
}


async def seed_initial_data(db: AsyncSession) -> None:
    await _seed_superadmin(db)
    await _seed_work_types(db)
    await _seed_kanban_columns(db)
    await _seed_app_settings(db)
    await db.commit()


async def _seed_superadmin(db: AsyncSession) -> None:
    if not settings.SUPERADMIN_PASSWORD:
        return

    result = await db.execute(select(User).where(User.role == "superadmin"))
    if result.scalar_one_or_none():
        return

    admin = User(
        email=settings.SUPERADMIN_EMAIL.lower(),
        hashed_password=hash_password(settings.SUPERADMIN_PASSWORD),
        full_name=settings.SUPERADMIN_FULL_NAME,
        role="superadmin",
        is_active=True,
    )
    db.add(admin)


async def _seed_work_types(db: AsyncSession) -> None:
    result = await db.execute(select(WorkType).limit(1))
    if result.scalar_one_or_none():
        return

    for wt in DEFAULT_WORK_TYPES:
        db.add(WorkType(**wt))


async def _seed_kanban_columns(db: AsyncSession) -> None:
    result = await db.execute(select(KanbanColumn).limit(1))
    if result.scalar_one_or_none():
        return

    for col in DEFAULT_KANBAN_COLUMNS:
        db.add(KanbanColumn(**col))


async def _seed_app_settings(db: AsyncSession) -> None:
    for key, value in DEFAULT_APP_SETTINGS.items():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        if not result.scalar_one_or_none():
            db.add(AppSetting(key=key, value=value))
