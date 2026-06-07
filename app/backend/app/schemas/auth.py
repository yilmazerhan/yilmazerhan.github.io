import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
import re


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    preferred_language: str = "tr"

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Şifre en az 8 karakter olmalıdır.")
        if len(v) > 4096:
            raise ValueError("Şifre en fazla 4096 karakter olabilir.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Şifre en az bir büyük harf içermelidir.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Şifre en az bir küçük harf içermelidir.")
        if not re.search(r"\d", v):
            raise ValueError("Şifre en az bir rakam içermelidir.")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2 or len(v) > 255:
            raise ValueError("Ad Soyad 2-255 karakter arasında olmalıdır.")
        return v

    @field_validator("preferred_language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if v not in ("tr", "en"):
            raise ValueError("Dil 'tr' veya 'en' olmalıdır.")
        return v


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=255)
    password: str = Field(..., max_length=4096)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Şifre en az 8 karakter olmalıdır.")
        if len(v) > 4096:
            raise ValueError("Şifre en fazla 4096 karakter olabilir.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Şifre en az bir büyük harf içermelidir.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Şifre en az bir küçük harf içermelidir.")
        if not re.search(r"\d", v):
            raise ValueError("Şifre en az bir rakam içermelidir.")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserPublic(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    full_name: str
    role: str
    team_id: Optional[uuid.UUID]
    preferred_language: str
    preferred_theme: str
    is_active: bool
    last_login_at: Optional[datetime]

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str
