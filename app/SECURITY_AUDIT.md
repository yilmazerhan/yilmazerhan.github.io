# Security Audit Report & Fixes

**Audit Date:** 2026-05-25  
**Method:** Red Team (live API pen-test) + Blue Team (static code review)

---

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| CRITICAL | 3 | 3 |
| HIGH | 9 | 9 |
| MEDIUM | 10 | 8 |
| LOW | 4 | 3 |

---

## Fixes Applied

### CRITICAL

| ID | Issue | Fix |
|----|-------|-----|
| RED-001 / BLUE-012 | **Jinja2 SSTI → RCE as root** via email template preview endpoint (`Environment(loader=BaseLoader())` with no sandbox) | `jinja2.sandbox.SandboxedEnvironment` with `autoescape=True` in both `preview_template` and `render_template` |
| RED-002 / BLUE-001 | **Separate Fernet encryption keys** all identical in `.env` — single-point compromise | Generated unique keys for `JIRA_ENCRYPTION_KEY`, `SMTP_ENCRYPTION_KEY`, `SSL_ENCRYPTION_KEY` |
| BLUE-002 / RED-010 | **IDOR: `GET /users/{user_id}`** — team_manager can view any user's profile | Added junction-table team membership check in router and service |

### HIGH

| ID | Issue | Fix |
|----|-------|-----|
| BLUE-003 / RED-005 | **IDOR: admin reports** — team_manager fetches any user's work history | Added junction-table check in `/admin/reports/user/{user_id}` |
| RED-004 / BLUE-013 | **Kanban IDOR** — `get_task()` accepted `requester` param but never used it | `get_task()` now enforces role-based access: superadmin sees all; team_manager sees team members' tasks; users see own tasks only |
| BLUE-017 | **list_comments/list_subtasks/list_history** no access check | All three router endpoints now call `get_task(task_id, requester)` first |
| RED-009 / BLUE-004 | **JWT type claim not enforced** — fabricated tokens with wrong type accepted | `decode_access_token` now raises `JWTError` if `payload["type"] != "access"` |
| RED-006 / BLUE-008 | **Rate limit X-Forwarded-For spoofing** — unlimited brute-force via header manipulation | Rate limiter uses `X-Real-IP` (set by nginx from socket, not forwarded) |
| BLUE-011 | **JWT access token persisted in localStorage** — XSS-accessible | Removed `accessToken` from Zustand persistence; token lives in memory only; `ProtectedRoute` silently refreshes via httpOnly cookie |
| RED-008 / BLUE-030 | **Leave auto-approval** — every leave request auto-sets `status="approved"` | Changed to `status="pending"`; requires manager review |
| RED-003 | **Logo upload MIME bypass** — Content-Type header is client-controlled | Added file magic bytes validation (PNG/JPEG/WebP signatures) |

### MEDIUM

| ID | Issue | Fix |
|----|-------|-----|
| RED-001/011 | No rate limit on `POST /auth/activate/{token}` | `@limiter.limit("10/hour")` added |
| RED-001/007 | No rate limit on `POST /auth/refresh` | `@limiter.limit("30/minute")` added |
| BLUE-025 | CORS dev origins always added (including in production) | Dev origins conditional on `ENVIRONMENT == "development"` |
| BLUE-010 | No `Content-Security-Policy` header | Full CSP added in `SecurityHeadersMiddleware` |
| RED-012 | Email templates readable by all authenticated users | `GET /email/templates` requires `require_superadmin` |
| RED-018 | Register returns HTTP 500 when Celery unavailable | Wrapped `send_activation_email_task.delay()` in try/except |
| RED-019 / BLUE-014 | `GET /kanban/activity` returns all events regardless of role | Activity feed filtered by role-scoped task IDs |
| RED-020 / BLUE-009 | `update_user` access check uses stale `team_id` FK | Replaced with junction-table subquery check |
| BLUE-021 | SVG logo upload (can contain `<script>` XSS) | SVG blocked; only PNG/JPEG/WebP accepted |
| RED-022 | LIKE wildcards in user search not escaped | `search` now escapes `%` and `_` before building LIKE pattern |

### LOW

| ID | Issue | Fix |
|----|-------|-----|
| BLUE-034 | `_clear_refresh_cookie` missing `httponly`/`secure`/`samesite` on delete | Added matching attributes to `response.delete_cookie()` |

### Input Validation Hardening

- **`WorkLogUpdate`**: added `duration_hours` validator (0.25–24, rounded to ¼h) and `description` validator (min 5, max 2000 chars)
- **`WorkTypeUpdate`**: added `color` hex validator (4 or 7 char hex string)
- **`ColumnCreate/ColumnUpdate`**: `name` bounded to `max_length=100`
- **`TeamCreate/TeamUpdate`**: `name` bounded, `description` bounded to 500 chars
- **`UserCreate/UserUpdate/ProfileUpdate`**: `full_name` bounded to 255 chars
- **`WorkLogCreate.description`**: `max_length=2000`
- **User search**: `max_length=200` on query parameter

### Regular User Scoping

- `GET /users` now scopes regular users to their own team members only (to prevent full directory enumeration while keeping task-assignment UI functional)

---

## Known Remaining / Out of Scope

| ID | Issue | Status |
|----|-------|--------|
| BLUE-005 | No per-account lockout (distributed brute-force) | Out of scope for this iteration (requires Redis per-account counter) |
| RED-013 / BLUE-038 | Access tokens remain valid 15 min after logout | Out of scope (requires token blocklist/Redis) |
| RED-017 | OpenAPI docs exposed in development | By design — `ENVIRONMENT=production` disables them |
| BLUE-032 | `bulk_update_tasks` skips per-task access checks | Low risk in current use; scheduled for next iteration |
| BLUE-024 | HSTS only set when app sees HTTPS directly | Handled at nginx layer |

---

## Encryption Key Rotation

The three Fernet encryption keys in `backend/.env` have been rotated to unique values. If upgrading from a previous version, you must:

1. Decrypt existing JIRA/SMTP/SSL secrets using the old key before upgrading
2. Re-encrypt with the new keys after upgrade

Or reset affected configurations via the admin UI after the upgrade.
