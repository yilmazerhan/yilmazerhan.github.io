import uuid
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.patch import (
    PatchCreate, PatchUpdate, PatchResponse, PatchListResponse,
    CustomerCreate, CustomerResponse,
)
from app.schemas.auth import MessageResponse
from app.services.patch_service import PatchService
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/patches", tags=["patches"])


# ─── Customer endpoints ───────────────────────────────────────────────────────

@router.get("/customers", response_model=list[CustomerResponse])
async def list_customers(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PatchService(db)
    return await svc.list_customers()


@router.post("/customers", response_model=CustomerResponse, status_code=201)
async def create_customer(
    body: CustomerCreate,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PatchService(db)
    return await svc.create_customer(body)


# ─── Patch endpoints ──────────────────────────────────────────────────────────

@router.get("", response_model=PatchListResponse)
async def list_patches(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    svc = PatchService(db)
    items, total = await svc.list_patches(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        environment=environment,
        date_from=date_from,
        date_to=date_to,
    )
    return PatchListResponse(items=items, total=total, skip=skip, limit=limit)


@router.post("", response_model=PatchResponse, status_code=201)
async def create_patch(
    body: PatchCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PatchService(db)
    patch = await svc.create_patch(body, created_by_id=current_user.id)
    return patch


@router.get("/{patch_id}", response_model=PatchResponse)
async def get_patch(
    patch_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PatchService(db)
    return await svc.get_patch(patch_id)


@router.patch("/{patch_id}", response_model=PatchResponse)
async def update_patch(
    patch_id: uuid.UUID,
    body: PatchUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PatchService(db)
    return await svc.update_patch(patch_id, body, requester=current_user)


@router.delete("/{patch_id}", response_model=MessageResponse)
async def delete_patch(
    patch_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = PatchService(db)
    await svc.delete_patch(patch_id, requester=current_user)
    return {"message": "Müşteri yaması silindi."}
