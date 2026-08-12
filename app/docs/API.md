# API Reference

Base path: `/api/v1`  
Auth: Bearer token in `Authorization` header (15-minute JWT access token).  
OpenAPI docs (development only): `GET /api/docs`

---

## Auth `/api/v1/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Register new user; sends activation email |
| POST | `/auth/login` | — | Email+password → JWT + httpOnly refresh cookie. Rate-limited: 5/minute |
| POST | `/auth/logout` | ✓ | Revoke refresh token, clear cookie |
| POST | `/auth/refresh` | cookie | Exchange refresh cookie for new access token |
| POST | `/auth/forgot-password` | — | Send password reset email. Rate-limited: 3/hour. Always returns 200 |
| POST | `/auth/reset-password` | — | Set new password with reset token |
| POST | `/auth/activate/{token}` | — | Activate account via email link |
| GET | `/auth/me` | ✓ | Current user profile |

### POST /auth/login
```json
// Request
{ "email": "user@example.com", "password": "Secret123!" }

// Response 200
{ "access_token": "eyJ...", "token_type": "bearer", "expires_in": 900 }
```

---

## Users `/api/v1/users`

Requires: superadmin role

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List users. Query: `search`, `role`, `team_id`, `page`, `limit` |
| POST | `/users` | Create user |
| GET | `/users/{id}` | Get user detail |
| PATCH | `/users/{id}` | Update user |
| DELETE | `/users/{id}` | Soft-delete user |

---

## Teams `/api/v1/teams`

Requires: superadmin role

| Method | Path | Description |
|--------|------|-------------|
| GET | `/teams` | List teams |
| POST | `/teams` | Create team |
| PATCH | `/teams/{id}` | Update team |
| DELETE | `/teams/{id}` | Delete team |
| POST | `/teams/{id}/members` | Add member `{ user_id }` |
| DELETE | `/teams/{id}/members/{user_id}` | Remove member |

---

## Permissions `/api/v1/permissions`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/permissions/users/{id}` | superadmin | Get permission overrides for user |
| PUT | `/permissions/users/{id}` | superadmin | Replace full override set |
| DELETE | `/permissions/users/{id}` | superadmin | Clear all overrides |
| GET | `/permissions/effective/{id}` | superadmin | Computed effective permissions |

---

## Work Logs `/api/v1/worklogs`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/worklogs` | ✓ | List logs. Query: `user_id`, `date_from`, `date_to`, `work_type_id`, `page`, `limit` |
| POST | `/worklogs` | ✓ | Create log entry |
| GET | `/worklogs/{id}` | ✓ | Get log |
| PATCH | `/worklogs/{id}` | ✓ | Update log (3-day rule enforced) |
| DELETE | `/worklogs/{id}` | ✓ | Delete log (3-day rule enforced) |
| GET | `/worklogs/stats/summary` | ✓ | Aggregated hours by user / work_type |
| GET | `/worklogs/work-types` | ✓ | List work types |
| POST | `/worklogs/work-types` | superadmin | Create work type |
| PATCH | `/worklogs/work-types/{id}` | superadmin | Update work type |
| DELETE | `/worklogs/work-types/{id}` | superadmin | Delete work type |

### 3-Day Edit Rule
- Regular users can only edit/delete their own logs within 3 days of `log_date`.
- Team managers can edit logs from their team without time restriction.
- Superadmin can edit any log without restriction.

---

## Kanban `/api/v1/kanban`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/kanban/columns` | ✓ | List columns |
| POST | `/kanban/columns` | superadmin | Create column |
| PATCH | `/kanban/columns/{id}` | manager+ | Update column |
| DELETE | `/kanban/columns/{id}` | superadmin | Delete column |
| PUT | `/kanban/columns/reorder` | manager+ | Reorder columns `[{id, sort_order}]` |
| GET | `/kanban/tasks` | ✓ | List tasks. Query: `column_id`, `assignee_id`, `priority`, `is_archived`, `page`, `limit` |
| POST | `/kanban/tasks` | ✓ | Create task |
| GET | `/kanban/tasks/{id}` | ✓ | Get task detail |
| PATCH | `/kanban/tasks/{id}` | ✓ | Update task |
| DELETE | `/kanban/tasks/{id}` | ✓ | Delete task |
| PATCH | `/kanban/tasks/{id}/move` | ✓ | Move to column `{ column_id, sort_order }` |
| GET | `/kanban/tasks/{id}/jira` | ✓ | Live Jira status (cached 30 min) |
| POST | `/kanban/tasks/bulk-update-jira` | manager+ | Bulk refresh Jira statuses |

---

## Jira `/api/v1/jira`

Requires: superadmin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jira/configs` | List Jira configurations |
| POST | `/jira/configs` | Create configuration |
| PATCH | `/jira/configs/{id}` | Update configuration |
| DELETE | `/jira/configs/{id}` | Delete configuration |
| POST | `/jira/configs/{id}/test` | Test connection |

---

## Email `/api/v1/email`

Requires: superadmin (unless noted)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/email/templates` | List templates |
| POST | `/email/templates` | Create template |
| PATCH | `/email/templates/{id}` | Update template |
| DELETE | `/email/templates/{id}` | Delete template (system templates protected) |
| POST | `/email/templates/{id}/preview` | Render HTML preview with sample data |
| GET | `/email/workflows` | List workflows |
| POST | `/email/workflows` | Create workflow |
| PATCH | `/email/workflows/{id}` | Update workflow |
| DELETE | `/email/workflows/{id}` | Delete workflow |
| PATCH | `/email/workflows/{id}/toggle` | Toggle active state |
| POST | `/email/workflows/{id}/test-run` | Manual trigger |
| GET | `/email/smtp` | Get SMTP config |
| PUT | `/email/smtp` | Set SMTP config |
| POST | `/email/smtp/test` | Send test email |
| GET | `/email/logs` | Email log list (manager+) |

---

## Admin `/api/v1/admin`

Requires: superadmin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/audit-logs` | Audit log list with filtering |
| GET | `/admin/stats/dashboard` | System-wide statistics |
| GET | `/admin/ssl` | List SSL certificates |
| POST | `/admin/ssl/upload-pem` | Upload PEM cert+key |
| POST | `/admin/ssl/upload-jks` | Upload JKS (converted to PEM) |
| POST | `/admin/ssl/activate/{id}` | Activate certificate (triggers nginx reload) |
| GET | `/admin/settings/branding` | Get branding settings |
| PUT | `/admin/settings/branding` | Update company name, primary color |
| POST | `/admin/settings/branding/logo` | Upload company logo (PNG/SVG/JPG ≤ 1 MB) |

---

## Public `/api/v1/public`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/branding` | — | Branding data for login page |

---

## Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Bad Request — malformed input |
| 401 | Unauthorized — missing or invalid token |
| 403 | Forbidden — insufficient role/permission |
| 404 | Not Found |
| 409 | Conflict — e.g. duplicate email |
| 422 | Validation Error — Pydantic schema failure |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |

All errors return `{ "detail": "human-readable message" }`.
