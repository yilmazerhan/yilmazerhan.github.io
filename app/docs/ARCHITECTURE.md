# Architecture

## Overview

A full-stack team workflow management application built for internal use. It provides work log tracking, Kanban task management, Jira integration, automated email/Teams notifications, and granular role-based access control.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | FastAPI (Python 3.12) | Native async, Pydantic validation, auto OpenAPI docs |
| Frontend | React 18 + TypeScript + Vite | @dnd-kit for Kanban DnD, TanStack Query, wide ecosystem |
| Database | PostgreSQL 15 | Required; robust, JSONB support |
| ORM | SQLAlchemy 2.0 async + Alembic | Production-grade, migration control |
| Background Jobs | Celery + Redis | Reliable retry-capable email dispatch |
| Scheduler | Celery Beat + APScheduler | Email workflow trigger evaluation (15 min interval) |
| Password Hashing | Argon2id (argon2-cffi) | Memory-hard; recommended by OWASP |
| Auth | JWT access (15 min) + httpOnly refresh cookie (7 days) | CSRF protection via SameSite=Strict |
| Email | FastAPI-Mail + Jinja2 | Async SMTP, template system |
| CSS | Tailwind CSS + shadcn/ui | Fast, consistent UI components |
| State | TanStack Query + Zustand | Server/client state separation |
| i18n | react-i18next | Turkish / English user-selectable |
| Teams | Incoming Webhook (Adaptive Card) | Parallel notifications alongside email |

## Service Topology (Docker Compose)

```
nginx (443/80) ──► frontend (React, port 80 inside)
              └──► backend (FastAPI, port 8000 inside)
                        │
                        ├── PostgreSQL 15
                        ├── Redis 7
                        ├── celery_worker
                        └── celery_beat
```

## Directory Layout

```
app/
├── docker-compose.yml
├── docker-compose.override.yml   (dev mounts + hot reload)
├── .env.example
├── nginx/
│   └── nginx.conf
├── backend/
│   ├── Dockerfile                (multi-stage: development / production)
│   ├── pyproject.toml
│   ├── alembic/versions/
│   └── app/
│       ├── main.py               FastAPI factory, middleware, router registration
│       ├── config.py             Pydantic Settings (env-driven)
│       ├── database.py           Async engine + session factory
│       ├── models/               SQLAlchemy ORM models
│       ├── schemas/              Pydantic v2 request / response schemas
│       ├── routers/              Thin HTTP layer — delegates to services
│       ├── services/             Business logic
│       ├── core/
│       │   ├── security.py       JWT helpers, Argon2 hashing
│       │   ├── dependencies.py   FastAPI dependency injection
│       │   ├── permissions.py    RBAC engine + 3-day worklog rule
│       │   ├── rate_limit.py     slowapi configuration
│       │   └── middleware.py     Audit log + security headers
│       └── tasks/
│           ├── celery_app.py
│           ├── email_tasks.py
│           └── scheduler.py      Email workflow evaluator
└── frontend/
    ├── Dockerfile                (dev / build / production stages)
    ├── src/
    │   ├── api/                  TanStack Query hooks + axios client
    │   ├── store/                Zustand stores (auth, branding, UI)
    │   ├── types/                TypeScript interfaces
    │   ├── components/           Reusable UI components
    │   └── pages/                Route-level page components
    ├── e2e/                      Playwright E2E test suite
    └── playwright.config.ts
```

## Key Architectural Decisions

### Security-first Auth
Access tokens live only in memory (Zustand). Refresh tokens are httpOnly cookies with `SameSite=Strict` and `Secure` flags — this combination blocks both XSS token theft and CSRF replay.

### ORM-only Data Access
All database queries go through SQLAlchemy ORM. No raw SQL strings anywhere. This categorically prevents SQL injection.

### Encrypted Secrets at Rest
Jira API tokens, SMTP passwords, and SSL private keys are encrypted with Fernet (AES-128-CBC + HMAC) before storage. Encryption keys come from environment variables, never the database.

### Audit Trail
A middleware intercepts every mutating API call and writes to `audit_logs` with old/new JSON snapshots. This is not optional and cannot be bypassed by application code.

### Soft Delete
Users and sensitive records use `is_deleted` flags instead of hard `DELETE`. This preserves referential integrity in audit logs and allows recovery.
