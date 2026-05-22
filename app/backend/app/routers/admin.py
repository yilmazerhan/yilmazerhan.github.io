import uuid
import base64
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.admin import SslCertificateResponse, BrandingResponse, BrandingUpdate
from app.schemas.auth import MessageResponse
from app.services.ssl_service import SslService
from app.services.branding_service import get_branding, update_branding, update_logo
from app.core.dependencies import get_current_user, require_superadmin

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── SSL ──────────────────────────────────────────────────────────────────────

@router.get("/ssl", response_model=list[SslCertificateResponse])
async def list_ssl_certs(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = SslService(db)
    return await svc.list_certificates()


@router.post("/ssl/upload-pem", response_model=SslCertificateResponse, status_code=201)
async def upload_pem(
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    name: str = Form(...),
    cert_file: UploadFile = File(...),
    key_file: UploadFile = File(...),
):
    cert_bytes = await cert_file.read()
    key_bytes = await key_file.read()
    svc = SslService(db)
    return await svc.upload_pem(name, cert_bytes, key_bytes, current_user.id)


@router.post("/ssl/upload-jks", response_model=SslCertificateResponse, status_code=201)
async def upload_jks(
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    name: str = Form(...),
    password: str = Form(...),
    jks_file: UploadFile = File(...),
):
    jks_bytes = await jks_file.read()
    svc = SslService(db)
    return await svc.upload_jks(name, jks_bytes, password, current_user.id)


@router.post("/ssl/activate/{cert_id}", response_model=SslCertificateResponse)
async def activate_cert(
    cert_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = SslService(db)
    return await svc.activate_certificate(cert_id)


@router.delete("/ssl/{cert_id}", response_model=MessageResponse)
async def delete_cert(
    cert_id: uuid.UUID,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = SslService(db)
    await svc.delete_certificate(cert_id)
    return {"message": "Sertifika silindi."}


# ─── Branding ─────────────────────────────────────────────────────────────────

@router.get("/settings/branding", response_model=BrandingResponse)
async def get_branding_settings(
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await get_branding(db)


@router.put("/settings/branding", response_model=BrandingResponse)
async def update_branding_settings(
    body: BrandingUpdate,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await update_branding(db, current_user.id, body.company_name, body.primary_color)


@router.post("/settings/branding/logo", response_model=BrandingResponse)
async def upload_logo(
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    logo: UploadFile = File(...),
):
    if logo.content_type not in ("image/png", "image/jpeg", "image/svg+xml", "image/webp"):
        from app.core.exceptions import ValidationError
        raise ValidationError("Logo PNG, JPEG, SVG veya WebP formatında olmalıdır.")

    data = await logo.read()
    if len(data) > 1_048_576:  # 1MB
        from app.core.exceptions import ValidationError
        raise ValidationError("Logo dosyası 1MB'dan küçük olmalıdır.")

    b64 = base64.b64encode(data).decode()
    logo_url = f"data:{logo.content_type};base64,{b64}"
    return await update_logo(db, current_user.id, logo_url)
