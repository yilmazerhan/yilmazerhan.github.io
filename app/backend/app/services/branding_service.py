import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.app_setting import AppSetting


BRANDING_KEYS = ("company_name", "company_logo", "primary_color")


async def get_branding(db: AsyncSession) -> dict:
    result = await db.execute(
        select(AppSetting).where(AppSetting.key.in_(BRANDING_KEYS))
    )
    rows = result.scalars().all()
    data = {r.key: r.value for r in rows}
    return {
        "company_name": data.get("company_name", "Ekip Yönetimi"),
        "company_logo": data.get("company_logo", ""),
        "primary_color": data.get("primary_color", "#3b82f6"),
    }


async def update_branding(
    db: AsyncSession,
    updated_by: uuid.UUID,
    company_name: Optional[str] = None,
    primary_color: Optional[str] = None,
) -> dict:
    updates = {}
    if company_name is not None:
        updates["company_name"] = company_name
    if primary_color is not None:
        updates["primary_color"] = primary_color

    for key, value in updates.items():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
            setting.updated_by = updated_by
        else:
            db.add(AppSetting(key=key, value=value, updated_by=updated_by))

    await db.flush()
    return await get_branding(db)


async def update_logo(
    db: AsyncSession,
    updated_by: uuid.UUID,
    logo_data: str,
) -> dict:
    result = await db.execute(select(AppSetting).where(AppSetting.key == "company_logo"))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = logo_data
        setting.updated_by = updated_by
    else:
        db.add(AppSetting(key="company_logo", value=logo_data, updated_by=updated_by))
    await db.flush()
    return await get_branding(db)
