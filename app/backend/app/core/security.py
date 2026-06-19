import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
import jwt
from jwt.exceptions import InvalidTokenError as JWTError
from cryptography.fernet import Fernet

from app.config import settings

_ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2, hash_len=32, salt_len=16)

# Pre-computed dummy hash used during login to run verify_password even when
# the username does not exist, preventing timing-based user enumeration.
DUMMY_PASSWORD_HASH = _ph.hash("__dummy_constant_password_for_timing_protection__")


# ─── Password ──────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed_password: str) -> bool:
    return _ph.check_needs_rehash(hashed_password)


# ─── JWT ───────────────────────────────────────────────────────────────────
def create_access_token(user_id: uuid.UUID, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    # Reject tokens that are not explicitly typed as access tokens
    # (prevents using a fabricated or wrong-type token as an auth bearer)
    if payload.get("type") != "access":
        raise JWTError("Token tipi geçersiz.")
    return payload


# ─── Refresh Token ─────────────────────────────────────────────────────────
def generate_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, hashed_token)."""
    raw = secrets.token_urlsafe(64)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def refresh_token_expire() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


# ─── One-time Tokens (password reset, activation) ──────────────────────────
def generate_secure_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash)."""
    raw = secrets.token_urlsafe(48)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def password_reset_expire() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS)


def activation_token_expire() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=settings.ACCOUNT_ACTIVATION_TOKEN_EXPIRE_HOURS)


# ─── Field Encryption (Fernet) ─────────────────────────────────────────────
def _get_fernet(key: str) -> Fernet:
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_field(plaintext: str, key: str) -> str:
    f = _get_fernet(key)
    return f.encrypt(plaintext.encode()).decode()


def decrypt_field(ciphertext: str, key: str) -> str:
    f = _get_fernet(key)
    return f.decrypt(ciphertext.encode()).decode()
