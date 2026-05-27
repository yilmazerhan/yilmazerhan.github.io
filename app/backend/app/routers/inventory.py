import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemUpdate,
    InventoryItemResponse,
    InventoryRevealRequest,
    InventoryRevealResponse,
    InventoryScheduleCreate,
    InventoryScheduleUpdate,
    InventoryScheduleResponse,
)
from app.schemas.auth import MessageResponse
from app.services.inventory_service import InventoryService
from app.core.dependencies import get_current_user, require_permission
from app.core.rate_limit import limiter

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _item_to_response(item) -> InventoryItemResponse:
    return InventoryItemResponse(
        id=item.id,
        item_type=item.item_type,
        display_name=item.display_name,
        description=item.description,
        notes=item.notes,
        tags=item.tags or [],
        is_active=item.is_active,
        hostname=item.hostname,
        ip_address=item.ip_address,
        port=item.port,
        username=item.username,
        has_password=bool(item.password_encrypted),
        has_ssh_key=bool(item.ssh_key_encrypted),
        operating_system=item.operating_system,
        database_name=item.database_name,
        database_type=item.database_type,
        email_address=item.email_address,
        smtp_host=item.smtp_host,
        smtp_port=item.smtp_port,
        imap_host=item.imap_host,
        imap_port=item.imap_port,
        provider=item.provider,
        account_id=item.account_id,
        has_access_key=bool(item.access_key_id_encrypted),
        region=item.region,
        url=item.url,
        created_by=item.created_by,
        updated_by=item.updated_by,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


# ─── Items ────────────────────────────────────────────────────────────────────

@router.get("/items", response_model=list[InventoryItemResponse])
async def list_items(
    _: Annotated[User, Depends(require_permission("inventory", "view"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    item_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
):
    tags_list = [t.strip() for t in tags.split(",")] if tags else None
    svc = InventoryService(db)
    items = await svc.list_items(
        item_type=item_type,
        search=search,
        tags=tags_list,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )
    return [_item_to_response(i) for i in items]


@router.post("/items", response_model=InventoryItemResponse, status_code=201)
async def create_item(
    body: InventoryItemCreate,
    current_user: Annotated[User, Depends(require_permission("inventory", "create"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    # Separate plaintext sensitive fields from the rest
    data = body.model_dump(exclude_none=True)
    item = await svc.create_item(data, created_by=current_user.id)
    return _item_to_response(item)


@router.get("/items/{item_id}", response_model=InventoryItemResponse)
async def get_item(
    item_id: uuid.UUID,
    _: Annotated[User, Depends(require_permission("inventory", "view"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    item = await svc.get_item(item_id)
    return _item_to_response(item)


@router.patch("/items/{item_id}", response_model=InventoryItemResponse)
async def update_item(
    item_id: uuid.UUID,
    body: InventoryItemUpdate,
    current_user: Annotated[User, Depends(require_permission("inventory", "edit"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    data = body.model_dump(exclude_none=True)
    item = await svc.update_item(item_id, data, updated_by=current_user.id)
    return _item_to_response(item)


@router.delete("/items/{item_id}", response_model=MessageResponse)
async def delete_item(
    item_id: uuid.UUID,
    _: Annotated[User, Depends(require_permission("inventory", "delete"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    await svc.delete_item(item_id)
    return {"message": "Envanter öğesi silindi."}


@router.post("/items/{item_id}/reveal", response_model=InventoryRevealResponse)
@limiter.limit("10/minute")
async def reveal_field(
    request: Request,
    item_id: uuid.UUID,
    body: InventoryRevealRequest,
    _: Annotated[User, Depends(require_permission("inventory", "view"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    value = await svc.reveal_field(item_id, body.field)
    return {"field": body.field, "value": value}


# ─── Export ──────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_inventory(
    _: Annotated[User, Depends(require_permission("inventory", "view"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    fmt: str = Query("excel", alias="format"),
    item_type: Optional[str] = Query(None),
):
    svc = InventoryService(db)

    if fmt == "csv":
        csv_content = await svc.export_csv(item_type=item_type)
        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=inventory.csv"},
        )
    else:
        excel_bytes = await svc.export_excel(item_type=item_type)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=inventory.xlsx"},
        )


# ─── Email Schedules ─────────────────────────────────────────────────────────

@router.get("/schedules", response_model=list[InventoryScheduleResponse])
async def list_schedules(
    _: Annotated[User, Depends(require_permission("inventory", "view"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    return await svc.list_schedules()


@router.post("/schedules", response_model=InventoryScheduleResponse, status_code=201)
async def create_schedule(
    body: InventoryScheduleCreate,
    current_user: Annotated[User, Depends(require_permission("inventory", "create"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    data = body.model_dump(exclude_none=True)
    sch = await svc.create_schedule(data, created_by=current_user.id)
    return sch


@router.patch("/schedules/{schedule_id}", response_model=InventoryScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    body: InventoryScheduleUpdate,
    _: Annotated[User, Depends(require_permission("inventory", "edit"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    data = body.model_dump(exclude_none=True)
    return await svc.update_schedule(schedule_id, data)


@router.delete("/schedules/{schedule_id}", response_model=MessageResponse)
async def delete_schedule(
    schedule_id: uuid.UUID,
    _: Annotated[User, Depends(require_permission("inventory", "delete"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    await svc.delete_schedule(schedule_id)
    return {"message": "Zamanlama silindi."}


@router.post("/schedules/{schedule_id}/send-now", response_model=dict)
async def send_schedule_now(
    schedule_id: uuid.UUID,
    _: Annotated[User, Depends(require_permission("inventory", "edit"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = InventoryService(db)
    sent = await svc.send_now(schedule_id)
    return {"sent": sent}
