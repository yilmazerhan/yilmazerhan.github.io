from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.app_setting import AppSetting


async def get_branding(db: AsyncSession) -> dict:
    result = await db.execute(
        select(AppSetting).where(
            AppSetting.key.in_(["company_name", "company_logo", "primary_color"])
        )
    )
    settings_list = result.scalars().all()
    branding = {s.key: s.value for s in settings_list}
    return {
        "company_name": branding.get("company_name", "Team App"),
        "company_logo": branding.get("company_logo", ""),
        "primary_color": branding.get("primary_color", "#3b82f6"),
    }
