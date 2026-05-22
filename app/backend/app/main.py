from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.middleware import SecurityHeadersMiddleware
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.routers import auth, users, teams, permissions, worklog, kanban, jira, email, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: seed superadmin if needed
    from app.database import AsyncSessionLocal
    from app.services.seed_service import seed_initial_data
    async with AsyncSessionLocal() as db:
        await seed_initial_data(db)
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="Ekip İş Akışı Yönetim Uygulaması",
    version="1.0.0",
    docs_url="/api/docs" if settings.is_development else None,
    redoc_url="/api/redoc" if settings.is_development else None,
    openapi_url="/api/openapi.json" if settings.is_development else None,
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)


# ─── Routers ──────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")
app.include_router(permissions.router, prefix="/api/v1")
app.include_router(worklog.router, prefix="/api/v1")
app.include_router(kanban.router, prefix="/api/v1")
app.include_router(jira.router, prefix="/api/v1")
app.include_router(email.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


# ─── Health check ─────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}


# ─── Public branding (no auth required) ───────────────────────────────────
@app.get("/api/v1/public/branding", tags=["public"])
async def public_branding():
    from app.database import AsyncSessionLocal
    from app.services.branding_service import get_branding
    async with AsyncSessionLocal() as db:
        return await get_branding(db)
