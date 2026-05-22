from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    ENVIRONMENT: Literal["development", "testing", "production"] = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    FRONTEND_URL: str = "https://localhost:3000"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://teamapp:teamapp@localhost:5432/teamapp"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Encryption keys (Fernet)
    JIRA_ENCRYPTION_KEY: str = ""
    SMTP_ENCRYPTION_KEY: str = ""
    SSL_ENCRYPTION_KEY: str = ""

    # JWT
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_RESET_TOKEN_EXPIRE_HOURS: int = 1
    ACCOUNT_ACTIVATION_TOKEN_EXPIRE_HOURS: int = 48

    # Rate limiting
    AUTH_LOGIN_RATE_LIMIT: str = "5/minute"
    AUTH_FORGOT_PASSWORD_RATE_LIMIT: str = "3/hour"

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

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_testing(self) -> bool:
        return self.ENVIRONMENT == "testing"


settings = Settings()
