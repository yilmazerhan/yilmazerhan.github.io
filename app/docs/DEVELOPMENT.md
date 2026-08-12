# Development Setup

## Prerequisites

- Docker 24+ and Docker Compose v2
- Git

Optional (for local development without Docker):
- Python 3.12 + [uv](https://docs.astral.sh/uv/)
- Node 22 + [pnpm](https://pnpm.io/)

## Quick Start

```bash
# 1. Clone and enter the app directory
git clone <repo>
cd app

# 2. Copy env file and fill in values
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, REDIS_PASSWORD, SECRET_KEY,
#             JIRA_ENCRYPTION_KEY, SMTP_ENCRYPTION_KEY, SSL_ENCRYPTION_KEY
#             SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD

# 3. Start everything
docker compose up -d

# 4. Check logs
docker compose logs -f backend
```

The app is available at **https://localhost** (self-signed cert — accept the browser warning).

## Generate Encryption Keys

```bash
# SECRET_KEY
python -c "import secrets; print(secrets.token_hex(32))"

# Fernet keys (JIRA_ENCRYPTION_KEY, SMTP_ENCRYPTION_KEY, SSL_ENCRYPTION_KEY)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Development Mode (docker-compose.dev.yml)

Development overrides live in `docker-compose.dev.yml` and must be requested
explicitly — they are **not** applied automatically:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

It:
- Mounts source directories into containers for hot reload
- Exposes PostgreSQL on `localhost:5432` and Redis on `localhost:6379`
- Runs backend with `--reload` and frontend with Vite HMR

> The file is deliberately **not** named `docker-compose.override.yml`. Compose
> auto-loads that name on every `docker compose up`, which would silently put a
> production host into development mode: SQL echo (logging password hashes),
> Fernet keys re-derived from `SECRET_KEY` (existing ciphertext becomes
> unreadable), rate limiting collapsing to a single shared counter, public
> `/api/docs`, and port 8000 published past nginx's TLS and security headers.

## Running Tests

### Backend

```bash
docker compose exec backend pytest -v
# Or with coverage:
docker compose exec backend pytest --cov=app --cov-report=term-missing
```

To run locally:
```bash
cd backend
uv pip install -e ".[dev]"
DATABASE_URL="postgresql+asyncpg://teamapp:teamapp@localhost/teamapp_test" pytest -v
```

### Frontend (unit tests)

```bash
docker compose exec frontend pnpm test
# With coverage:
docker compose exec frontend pnpm test:coverage
```

### E2E Tests (Playwright)

E2E tests require the full stack to be running.

```bash
cd frontend
pnpm install   # installs @playwright/test
pnpm exec playwright install --with-deps chromium firefox

# Run against local Docker stack
PLAYWRIGHT_BASE_URL=https://localhost SUPERADMIN_PASSWORD=YourPassword pnpm test:e2e

# Interactive UI mode
pnpm test:e2e:ui

# View HTML report after a run
pnpm test:e2e:report
```

## Generate TypeScript Types from OpenAPI

```bash
cd frontend
# Requires the backend to be running
OPENAPI_URL=https://localhost/api/openapi.json pnpm generate:types
```

Generated files appear in `src/api/generated/`.

## Database Migrations

```bash
# Apply all pending migrations
docker compose run --rm migration

# Create a new migration (with autogenerate)
docker compose exec backend alembic revision --autogenerate -m "describe_change"

# Downgrade one step
docker compose exec backend alembic downgrade -1
```

## Code Style

### Backend
```bash
# Lint + format
docker compose exec backend ruff check app/
docker compose exec backend ruff format app/
# Type check
docker compose exec backend mypy app/
```

### Frontend
```bash
docker compose exec frontend pnpm lint
docker compose exec frontend pnpm type-check
```

## Environment Variables Reference

See `.env.example` for all variables with descriptions.

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | Controls OpenAPI visibility, debug mode |
| `SECRET_KEY` | — | JWT signing key (64 hex chars) |
| `DATABASE_URL` | auto-constructed | PostgreSQL async connection string |
| `REDIS_URL` | auto-constructed | Redis connection string |
| `FRONTEND_URL` | `https://localhost` | Used for CORS and email links |
| `SUPERADMIN_EMAIL` | `admin@example.com` | Auto-seeded on first startup |
| `SUPERADMIN_PASSWORD` | — | Must be set before first startup |

## Useful Docker Commands

```bash
# Restart only the backend
docker compose restart backend

# Access PostgreSQL directly
docker compose exec db psql -U teamapp

# Access Redis CLI
docker compose exec redis redis-cli -a "$REDIS_PASSWORD"

# Watch Celery worker logs
docker compose logs -f celery_worker

# Full rebuild (after dependency changes)
docker compose build --no-cache backend frontend
docker compose up -d
```
