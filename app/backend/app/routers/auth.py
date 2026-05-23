from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Request, Response, Cookie
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import (
    RegisterRequest, LoginRequest, ForgotPasswordRequest,
    ResetPasswordRequest, TokenResponse, UserPublic, MessageResponse
)
from app.services.auth_service import AuthService
from app.core.dependencies import get_current_user
from app.core.rate_limit import limiter
from app.config import settings
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
COOKIE_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=COOKIE_MAX_AGE,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, path="/api/v1/auth")


@router.post("/register", response_model=MessageResponse, status_code=201)
async def register(
    body: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = AuthService(db)
    user, activation_token = await svc.register(body.email, body.password, body.full_name, body.preferred_language)
    from app.tasks.email_tasks import send_activation_email_task
    send_activation_email_task.delay(
        to_email=user.email,
        full_name=user.full_name,
        activation_token=activation_token,
    )
    return {"message": "Kayıt başarılı. Email adresinize aktivasyon bağlantısı gönderildi."}


@router.post("/activate/{token}", response_model=MessageResponse)
async def activate_account(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    svc = AuthService(db)
    await svc.activate_account(token)
    return {"message": "Hesabınız başarıyla aktive edildi. Giriş yapabilirsiniz."}


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.AUTH_LOGIN_RATE_LIMIT)
async def login(
    request: Request,
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = AuthService(db)
    user, access_token, raw_refresh = await svc.login(body.username, body.password)

    response = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    })
    _set_refresh_cookie(response, raw_refresh)
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token: Annotated[Optional[str], Cookie(alias=REFRESH_COOKIE)] = None,
):
    from app.core.exceptions import AuthenticationError
    if not refresh_token:
        raise AuthenticationError("Refresh token bulunamadı.")

    svc = AuthService(db)
    new_access, new_refresh = await svc.refresh_access_token(refresh_token)

    response = JSONResponse(content={
        "access_token": new_access,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    })
    _set_refresh_cookie(response, new_refresh)
    return response


@router.post("/logout", response_model=MessageResponse)
async def logout(
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token: Annotated[Optional[str], Cookie(alias=REFRESH_COOKIE)] = None,
):
    if refresh_token:
        svc = AuthService(db)
        await svc.logout(refresh_token)

    response = JSONResponse(content={"message": "Başarıyla çıkış yapıldı."})
    _clear_refresh_cookie(response)
    return response


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(settings.AUTH_FORGOT_PASSWORD_RATE_LIMIT)
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = AuthService(db)
    result = await svc.forgot_password(body.email)
    if result:
        user, raw_token = result
        from app.tasks.email_tasks import send_password_reset_email_task
        send_password_reset_email_task.delay(
            to_email=user.email,
            full_name=user.full_name,
            reset_token=raw_token,
        )

    # Always return success message to prevent user enumeration
    return {"message": "Şifre sıfırlama bağlantısı email adresinize gönderildi (eğer kayıtlıysa)."}


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    svc = AuthService(db)
    await svc.reset_password(body.token, body.new_password)
    return {"message": "Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz."}


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user
