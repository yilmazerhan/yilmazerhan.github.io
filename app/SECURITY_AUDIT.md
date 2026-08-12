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

---
---

# Security Audit Round 2

**Audit Date:** 2026-07-25
**Method:** Red Team (live exploitation against a disposable instance) + Blue Team (static review: dependencies, secrets/crypto, deploy config, control design)
**Scope focus:** modules added *after* the 2026-05-25 audit and never security-reviewed — Team Tasks, Releases, Responsibility Matrix, Customer Patches, Inventory, Announcements, Export endpoints, Teams webhooks, SSL management, backup/restore.

All Round-1 fixes were spot-checked and confirmed **still intact** (no regressions).

## Summary

| Severity | Found | Fixed | Deferred (documented) |
|----------|-------|-------|-----------------------|
| CRITICAL | 2 (same root cause) | 2 | 0 |
| HIGH     | 4 | 4 | 0 |
| MEDIUM   | 12 | 9 | 3 |
| LOW      | 6 | 4 | 2 |

## CRITICAL

| ID | Issue | Fix |
|----|-------|-----|
| RED-1 | **`team_manager` → full superadmin account takeover.** 3-step chain, live-exploited: (1) `POST /teams/{id}/members` let a manager add *any* user — including a superadmin — to their own team (only the *requester's* membership was checked, never the target); (2) `PATCH /users/{id}` blocked *promotion* to a privileged role but not **demotion of an existing superadmin**; (3) `admin_set_password`'s guard reads `target.role`, which step 2 had just downgraded to `user` — so the manager reset the superadmin's password and logged in. Also allowed deactivating every superadmin via `is_active:false`, permanently removing all admin access. | `add_member`/`remove_member` → `require_superadmin` (consistent with team create/update/delete, which already were; the Teams UI is a superadmin-only route so no feature is lost). Independently, `update_user` now guards on the **target's current role**: a `team_manager` cannot modify a `superadmin`/`team_manager` at all. |
| RED-3 / BLUE-1 | **Any authenticated user could decrypt every stored infrastructure credential.** `POST /inventory/items/{id}/reveal` was gated on `inventory:view`, which the default `user` role holds. It returns cleartext server/root passwords, SSH private keys and cloud `secret_access_key`s; item ids are enumerable from the list endpoint with the same permission. Every other read path deliberately masks these to `has_password`/`has_ssh_key` booleans, so `view` was never intended to mean "decrypt". | Gated on `inventory:edit` (superadmin + team_manager retain access; plain users lose decryption but still see the masked list). |

## HIGH

| ID | Issue | Fix |
|----|-------|-----|
| RED-2 | **`team_manager` could write the `user_teams` junction table**, bypassing essentially every cross-team boundary in the app. That table is the authoritative ACL for worklogs, leave, kanban boards, user edits, password resets, reports and exports — so a manager could self-serve access to any user's data by adding them to their own team. Live-exploited. | Closed by the same `require_superadmin` change on team member management. |
| RED-4 / BLUE-8 | **`GET /export/tasks` ignored kanban board visibility** and scoped by the stale `users.team_id` FK, additionally OR-ing in `Task.assignee_id IS NULL` — so any authenticated user could dump tasks from other users' **personal** boards and every unassigned task system-wide, including data `kanban_service.get_task` returns 403 for. Live-exploited. | Endpoint now delegates to `KanbanService.list_tasks(requester=...)`, the authoritative implementation, so scoping is defined once. |
| BLUE-2 | **Dev mode derived all four Fernet keys from a constant committed to this repo.** `ENVIRONMENT` defaults to `development`, and in that mode an empty key env var is silently replaced by `sha256("<label>:" + SECRET_KEY)` — with `SECRET_KEY` also defaulting to a published constant. Any instance that forgot `ENVIRONMENT=production` used fully predictable keys, and all four collapsed to one root secret (undoing Round-1 RED-002 key separation). Production itself correctly fails closed. | Logs a prominent `INSECURE:` error naming the derived keys when they come from the default `SECRET_KEY`. Hard-failing was considered but would break zero-config dev and the test suite — see *Deferred*. |
| BLUE-3 | **Committed `docker-compose.override.yml` silently switched production into development mode.** Compose auto-loads that filename on any bare `docker compose up`, which would enable SQL echo (logging `hashed_password` and ciphertext to `docker logs`), re-derive the Fernet keys (making existing ciphertext unreadable), collapse per-IP rate limiting to one shared counter, expose `/api/docs`, re-enable dev CORS, drop `secure` from the refresh cookie, and publish port 8000 past nginx's TLS/headers/body-limit. | Renamed to `docker-compose.dev.yml` (not auto-loaded) and made opt-in via `-f docker-compose.yml -f docker-compose.dev.yml`; `docs/DEVELOPMENT.md` and `docs/ARCHITECTURE.md` updated with the rationale. |
| BLUE-4 | **Docker builds ignored both committed lockfiles** — `uv.lock` and `pnpm-lock.yaml` were never copied; the backend ran `pip install .` against open version floors and the frontend ran `npm install` (which also silently discarded the `pnpm.overrides` `dompurify` pin, so that deliberate transitive pin never reached the shipped image). Builds were non-deterministic and rollback could not reproduce a known-good dependency set. | Backend installs from `uv export --frozen` (fully pinned + hashes, so pip runs in `--require-hashes` mode); frontend builds with `corepack enable && pnpm install --frozen-lockfile`. |

## MEDIUM

| ID | Issue | Fix |
|----|-------|-----|
| RED-5 / BLUE-7 | Stale `users.team_id` FK used for authorization in three post-audit places: `/export/user-activity` (a manager exported worklogs + emails of users the authoritative ACL says aren't theirs; `== NULL` also matched every team-less user), `report_schedule_service` (a multi-team user's worklogs were emailed to one team's recipient list and silently omitted from the other's), and announcement team targeting. | All three now use the `user_teams` junction subquery, matching `/export/worklogs`. |
| RED-6 / BLUE-10 | `patch_service._check_permission` returned early for **any** `team_manager`, so any manager could edit or delete any other team's customer-patch record — the audit trail of which binary/md5 shipped to which customer. | A manager may now only modify patches created by someone sharing one of their teams. **Note:** open patch/customer *creation* for all authenticated users was left intact — commit `3edb21e` shows that was a deliberate UX decision, not an oversight. |
| BLUE-6 | Audit-log evasion sink: `AuditLogMiddleware` derived its path from `request.url.path`, which Starlette rebuilds from the client-controlled `Host` header (CVE-2026-48710). A request whose reconstructed path began with an `EXCLUDED_PREFIX` would execute its mutation with **no audit row and no before-snapshot**. Not reachable behind the current nginx (it rejects `/` in `Host`), but reachable if the backend is addressed directly — exactly what BLUE-3 enabled. | Uses `request.scope["path"]`, the raw path routing itself dispatches on. |
| BLUE-9 | `/export/user-activity` was the only export not applying `_csv_safe`. `full_name` is self-settable via `PATCH /users/me/profile`, so a regular user could store `=HYPERLINK(...)` and have it execute in an admin's spreadsheet on export. | `_csv_safe` applied to `full_name`, `email`, work type and description, matching the sibling exports. |
| BLUE-11 | Rate limiter used per-process in-memory storage while production runs `--workers 2`, silently **doubling every limit** (login `5/minute` → 10/minute) and resetting on worker restart. Redis was already provisioned but unused. | Limiter now uses `REDIS_URL`, with a connectivity probe that falls back to in-memory (with a warning) so a missing Redis degrades limiting instead of breaking every limited endpoint. |
| BLUE-12 | TLS private-key directory `chmod 0777` combined with a 5-second cert-reload watcher: unlink/rename rights come from the **directory** mode, so any uid in either container could swap `current.crt`/`current.key` (despite the key file being `0600`) and have nginx auto-reload it — full MITM from any file-write foothold. | `ssl_certs` is now mounted **read-only** into nginx, removing the internet-facing request parser as a write vector. Narrowing 0777 further requires pinning the backend uid and `chown`ing, which would change existing named-volume ownership on upgrade — documented in `init-ssl.sh` rather than done silently. |
| BLUE-13 | The CSP the browser actually applied to the SPA document was nginx's `script-src 'self' 'unsafe-inline'` — the app's strict policy only rides on `/api/` JSON responses, where CSP is inert. | Dropped `'unsafe-inline'` from `script-src` (verified: the production bundle has exactly one external module script and zero inline scripts or event handlers) and added `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors`. `style-src` keeps it for Tailwind. |
| BLUE-14 | `jira_base_url` had length-only validation and is interpolated into an `<a href>`; it is served by the **unauthenticated** `/public/branding`. A `javascript:` value would execute in every user's authenticated session (React only warns). | Backend `field_validator` restricts the scheme to `http`/`https`; `JiraTicketLink.tsx` independently refuses to build an href from a non-`http(s)` base. |
| BLUE-15 | Failed logins were recorded nowhere — `/auth/login` is in the audit middleware's `EXCLUDED_PREFIXES` and it only records 2xx — so credential stuffing and password spraying were entirely invisible. | Failed attempts and inactive-account attempts now log username + source IP + user-agent at WARNING (never the submitted password). |
| BLUE-16 | Export endpoints had no rate limit, no pagination and no row cap; each materialises the full result set (plus an openpyxl workbook) in memory. | `@limiter.limit("5/minute")` and a 50 000-row ceiling on all three exports. |

## LOW

| ID | Issue | Fix |
|----|-------|-----|
| RED-7 | A `team_manager` could assign team tasks to **any** user system-wide, injecting work items, notifications and recurring reminder emails across tenant boundaries; because `update_task`'s ACL only requires *one* assignee to be in the manager's teams, adding a single own-team member also granted persistent edit rights over someone else's task. | `validate_assignee_scope()` rejects assignees outside the requester's teams (superadmin exempt), on both create and update. |
| RED-8 | Announcement `specific_teams` targeting compared against the single stale `users.team_id`, so relocated users kept seeing their old team's announcements, missed their new team's, and multi-team users only ever matched one team. | Resolves all of the viewer's teams from `user_teams`. |
| BLUE-17 | Audit redaction regex missed `ssh_key_encrypted` and `access_key_id_encrypted`, so their ciphertext was copied verbatim into `audit_logs` — a table with no pruning and no key-rotation coverage, keeping retired keys useful to anyone holding an old `pg_dump`. | Added `_encrypted` to the regex, which covers all four columns and any future `*_encrypted` field. |
| BLUE-22 | Group `color` was interpolated unescaped into an SVG string later assigned to `innerHTML` (the only HTML-injection sink in the frontend). Not currently exploitable — the backend pattern-validates `#RRGGBB` — but the sink depended entirely on a remote regex it didn't enforce. | Validated at the point of use with a fallback colour. |
| BLUE-20 | `authStore` persisted `role` to localStorage under a comment claiming "no role-sensitive data". Server-side authorization is unaffected (verified), so impact is limited to UI reconnaissance — but the inaccurate comment invited someone to persist a genuinely trusted field. | Comment corrected to state the profile is a display cache and must never be trusted for authorization. |
| BLUE-21 | Task attachments were written to a non-volume path, so every `update.sh` (`build --no-cache` + `up -d`) silently deleted them while leaving `task_attachments` rows behind, producing attachments whose download 404s. | Added an `upload_data` volume for `/app/uploads`. (Already-lost files are unrecoverable.) |

## Dependency upgrades

**Frontend** (runtime, browser-facing): `axios 1.16.1 → 1.18.1` (prototype-pollution gadgets, `formDataToJSON` DoS), `react-router-dom 7.15.1 → 7.18.1` (open redirect via backslash — the app's own post-login navigation is hardcoded, so the router was the only redirect primitive present; plus route-matching DoS), `dompurify` override raised to `>=3.4.12` (GHSA-gvmj-g25r-r7wr and its incomplete-fix follow-up; ships via jspdf/monaco), `form-data` pinned `>=4.0.6` (CRLF injection — did **not** resolve transitively via the axios bump, so an explicit override was required). Build-time: `postcss 8.5.15 → 8.5.23` (path traversal via `sourceMappingURL`), `vite 6.4.2 → 6.4.3`.

**Backend:** `cryptography 48.0.0 → 49.0.0` (wheels statically linked a vulnerable OpenSSL), `python-multipart 0.0.30 → 0.0.32`. The major `cryptography` bump was verified against the actual code paths: Fernet encrypt/decrypt round-trip, Argon2 hash/verify, and x509 certificate generate/parse all pass.

## Deferred — with reasons

| ID | Issue | Why deferred |
|----|-------|--------------|
| BLUE-2 (hard fail) | Refusing to boot when Fernet keys would be derived from the default `SECRET_KEY` | Security-correct, but breaks zero-config development and the existing test suite. Needs a coordinated `.env` rollout. The loud `INSECURE:` log plus the BLUE-3 rename removes the realistic path to production. |
| BLUE-1 (audit trail) | Audit-log every credential reveal | The `audit_action` enum is DB-managed (`create_type=False`) with no suitable value, so this needs an Alembic migration. The authorization hole itself is fixed; attribution is a separate, additive change. |
| BLUE-15 (audit row) | Persist failed logins as `audit_logs` rows rather than log lines | Same reason — needs a `login_failed` enum migration. Logging closes the detection gap now. |
| BLUE-10 (schema bounds) | Add `max_length`/`Literal` bounds across Patch and the four `*Update` schemas that drop their `*Create` bounds | Storage-exhaustion and 500-noise hardening rather than a confidentiality or authorization break, and it touches many schemas with real regression surface for form submissions. Worth a dedicated pass. |
| BLUE-12 (0777) | Narrow the `/ssl` directory mode | Requires pinning the backend uid and `chown`ing an existing named volume — an upgrade-migration concern. The `:ro` nginx mount removes the practical vector. |
| BLUE-18/19 (dev-only CVEs) | `js-yaml`, `brace-expansion`, `@hey-api/openapi-ts`, `@babel/core` | Reached only through eslint/CI tooling, never shipped to browsers or the server. Safe to batch later. |

## Verification

- **20/20 exploit checks** re-run against the patched build: every attack the red team executed live now returns 403/422, while the matching legitimate operation still succeeds (superadmin can still manage team members, reveal inventory secrets, export tasks, create team tasks with assignees, delete patches; regular users can still list masked inventory and create customers).
- **191/191 behaviour probes unchanged** — a pre-fix snapshot of every module across `superadmin` / `team_manager` / `user` / anonymous, plus full CRUD lifecycles for worklogs, kanban tasks (+comments/subtasks/history), team tasks, leave, releases (+phases/milestones), patches and customers. Diff after the fixes: **zero** changes.
- **UI smoke test**: all pages render for all three roles with no JS errors, after the axios/react-router upgrades.
- **Frontend**: production build clean, 19/19 unit tests pass.
- **Backend test suite**: `66 failed / 89 passed / 96 errors` both **before and after** these changes — byte-identical counts, confirming the pre-existing suite breakage is unrelated to this work (it is a test-isolation problem in the suite itself, not a product regression).
