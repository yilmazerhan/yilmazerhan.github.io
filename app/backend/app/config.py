from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from typing import Literal


_DEFAULT_SECRET = "dev-secret-key-change-in-production"
_ALLOWED_JWT_ALGORITHMS = {"HS256", "HS384", "HS512"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    ENVIRONMENT: Literal["development", "testing", "production"] = "development"
    SECRET_KEY: str = _DEFAULT_SECRET
    FRONTEND_URL: str = "https://localhost:3000"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://teamapp:teamapp@localhost:5432/teamapp"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Encryption keys (Fernet)
    JIRA_ENCRYPTION_KEY: str = ""
    SMTP_ENCRYPTION_KEY: str = ""
    SSL_ENCRYPTION_KEY: str = ""
    INVENTORY_ENCRYPTION_KEY: str = ""

    # JWT
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    SESSION_MAX_DURATION_HOURS: int = 12  # Absolute session lifetime from first login
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7    # Kept for reference; SESSION_MAX_DURATION_HOURS governs actual expiry
    PASSWORD_RESET_TOKEN_EXPIRE_HOURS: int = 1
    ACCOUNT_ACTIVATION_TOKEN_EXPIRE_HOURS: int = 48

    # Rate limiting
    AUTH_LOGIN_RATE_LIMIT: str = "5/minute"
    AUTH_FORGOT_PASSWORD_RATE_LIMIT: str = "3/hour"
    AUTH_REFRESH_RATE_LIMIT: str = "60/minute"

    # SuperAdmin seed
    SUPERADMIN_EMAIL: str = "admin@example.com"
    SUPERADMIN_PASSWORD: str = ""
    SUPERADMIN_FULL_NAME: str = "System Administrator"

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_db_url(cls, v: str) -> str:
        if not v.startswith("postgresql"):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection string")
        return v

    @field_validator("JWT_ALGORITHM")
    @classmethod
    def validate_jwt_algorithm(cls, v: str) -> str:
        if v not in _ALLOWED_JWT_ALGORITHMS:
            raise ValueError(f"JWT_ALGORITHM must be one of {_ALLOWED_JWT_ALGORITHMS}")
        return v

    @model_validator(mode="after")
    def fill_dev_encryption_keys(self) -> "Settings":
        """Derive stable Fernet keys from SECRET_KEY in development/testing so
        encryption-dependent features work without manual .env configuration.
        In production, keys must be set explicitly (enforced by validate_production_secrets)."""
        if self.ENVIRONMENT in ("development", "testing"):
            import base64
            import hashlib
            derived = []
            for label, attr in [
                ("jira", "JIRA_ENCRYPTION_KEY"),
                ("smtp", "SMTP_ENCRYPTION_KEY"),
                ("ssl", "SSL_ENCRYPTION_KEY"),
                ("inventory", "INVENTORY_ENCRYPTION_KEY"),
            ]:
                if not getattr(self, attr):
                    key = base64.urlsafe_b64encode(
                        hashlib.sha256(f"{label}:{self.SECRET_KEY}".encode()).digest()
                    ).decode()
                    object.__setattr__(self, attr, key)
                    derived.append(attr)
            if derived and self.SECRET_KEY == _DEFAULT_SECRET:
                # These keys are then a pure function of a constant committed to
                # this repository, so anyone can decrypt inventory credentials,
                # SMTP/Jira secrets and SSL private keys from a DB dump. Tolerable
                # for a throwaway dev DB; catastrophic if a real deployment ever
                # boots without ENVIRONMENT=production. Fail loudly rather than
                # silently, and do not put real secrets in such an instance.
                import logging
                logging.getLogger(__name__).error(
                    "INSECURE: %s derived from the default SECRET_KEY — these "
                    "encryption keys are PUBLICLY PREDICTABLE. Set SECRET_KEY and "
                    "ENVIRONMENT=production before storing any real secret.",
                    ", ".join(derived),
                )
        return self

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY == _DEFAULT_SECRET or len(self.SECRET_KEY) < 64:
                raise ValueError(
                    "SECRET_KEY must be a strong random value (≥64 chars) in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
                )
            if not self.SUPERADMIN_PASSWORD:
                raise ValueError("SUPERADMIN_PASSWORD must be set in production.")
            # Validate all Fernet encryption keys are non-empty in production
            from cryptography.fernet import Fernet
            for key_name, key_value in [
                ("JIRA_ENCRYPTION_KEY", self.JIRA_ENCRYPTION_KEY),
                ("SMTP_ENCRYPTION_KEY", self.SMTP_ENCRYPTION_KEY),
                ("SSL_ENCRYPTION_KEY", self.SSL_ENCRYPTION_KEY),
                ("INVENTORY_ENCRYPTION_KEY", self.INVENTORY_ENCRYPTION_KEY),
            ]:
                if not key_value:
                    raise ValueError(
                        f"{key_name} must be set in production. "
                        "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
                    )
                try:
                    Fernet(key_value.encode() if isinstance(key_value, str) else key_value)
                except Exception:
                    raise ValueError(f"{key_name} is not a valid Fernet key.")
        return self

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_testing(self) -> bool:
        return self.ENVIRONMENT == "testing"


settings = Settings()
