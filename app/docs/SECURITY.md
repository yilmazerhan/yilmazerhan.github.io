# Security

## Controls Checklist

### Authentication
- [x] **Argon2id** password hashing (argon2-cffi). Memory-hard, tuned to ≥500ms on production hardware.
- [x] JWT access tokens expire in **15 minutes**. Stored in memory (Zustand), never localStorage.
- [x] Refresh tokens (7 days) stored in **httpOnly, Secure, SameSite=Strict** cookies. This prevents XSS token theft and CSRF replay simultaneously.
- [x] Refresh tokens are single-use and stored as SHA-256 hashes; raw token is never persisted.
- [x] Soft-deleted (`is_deleted=True`) and inactive (`is_active=False`) users cannot log in.
- [x] Account activation required before first login — unactivated accounts cannot authenticate.

### Authorization
- [x] Every protected endpoint uses FastAPI dependencies: `get_current_user`, `require_superadmin`, `require_manager_or_above`.
- [x] Permission engine (`core/permissions.py`) resolves effective permissions: role defaults → `permission_overrides` table → superadmin bypass.
- [x] **3-day worklog edit rule** enforced server-side, not just in the frontend.
- [x] Kanban tasks: only assignee, creator, team manager, or superadmin may edit.

### Rate Limiting
- [x] `POST /auth/login` — **5 requests/minute** per IP (slowapi).
- [x] `POST /auth/forgot-password` — **3 requests/hour** per IP.
- [x] Rate limit exceeded returns **HTTP 429**.

### Input Validation
- [x] All request bodies validated by **Pydantic v2** schemas. No raw dict access.
- [x] Password minimum: 8 characters (backend enforced).
- [x] Task titles: 2–255 characters (backend enforced).
- [x] File uploads (logo, SSL cert): size and MIME type validated.

### SQL Injection Prevention
- [x] **SQLAlchemy ORM only** throughout the entire backend. No raw SQL strings (`text()`) in application code.
- [x] Grep test run in CI: `grep -r "text(" app/ --include="*.py"` fails if raw SQL is introduced.

### XSS Prevention
- [x] React escapes all rendered values by default. No `dangerouslySetInnerHTML` except sandboxed email preview iframe.
- [x] Email template preview rendered in `<iframe sandbox="allow-scripts">`.
- [x] `X-Content-Type-Options: nosniff` header prevents MIME sniffing.
- [x] `Content-Security-Policy` header restricts script/style sources.

### CSRF Prevention
- [x] Refresh tokens use `SameSite=Strict` cookies — cross-site requests never include the cookie.
- [x] API-only endpoints (JSON) are not vulnerable to form-based CSRF.

### Security Headers (middleware.py)
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Secrets at Rest
- [x] Jira API tokens encrypted with **Fernet (AES-128-CBC + HMAC-SHA256)** before DB storage.
- [x] SMTP passwords encrypted with Fernet.
- [x] SSL private keys encrypted with Fernet.
- [x] Encryption keys sourced from environment variables; never hardcoded.

### Audit Logging
- [x] `AuditLogMiddleware` intercepts all POST/PUT/PATCH/DELETE requests.
- [x] Writes old+new JSON snapshots, user ID, IP address, and user agent to `audit_logs`.
- [x] Audit records are never deleted (no DELETE endpoint for audit_logs).

### SSL / TLS
- [x] Nginx terminates TLS. HTTP port 80 redirects to HTTPS.
- [x] Default self-signed certificate auto-generated on first Docker startup.
- [x] Production certificates manageable via admin UI (PEM or JKS upload).
- [x] Certificates stored encrypted in DB; written to disk only when activated.

### Docker / Infrastructure
- [x] Backend runs as **non-root user** (`appuser`) in production image.
- [x] Multi-stage Dockerfiles — dev dependencies excluded from production images.
- [x] PostgreSQL and Redis not exposed on host ports in production (`docker-compose.yml`).
- [x] All inter-service communication on isolated Docker network (`internal`).

### Dependency Management
- [x] Python dependencies pinned in `pyproject.toml` with `uv`.
- [x] Node dependencies pinned with `pnpm-lock.yaml`.
- [x] Dependabot or `pip audit` / `pnpm audit` recommended for ongoing CVE tracking.

## Known Limitations / Future Work
- Password complexity beyond minimum length is not enforced (add zxcvbn if needed).
- No MFA/TOTP support yet.
- Jira API calls not proxied through backend in real-time — status is cached (30 min TTL).
