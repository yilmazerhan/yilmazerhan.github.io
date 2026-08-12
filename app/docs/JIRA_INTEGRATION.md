# Jira Integration

## Status

Infrastructure implemented and ready. Connection configuration is performed post-deployment via the admin UI (`Settings → Jira`).

## Supported Platforms

- **Jira Cloud** (primary): `https://company.atlassian.net`
- **Jira Server / Data Center**: Base URL points to self-hosted instance; same REST API v3 surface

## Authentication

Jira REST API v3 with **Basic Auth**:
- Email address of the Atlassian account
- API token generated at `https://id.atlassian.com/manage-profile/security/api-tokens`

API tokens are **Fernet-encrypted** before storage in the `jira_configs` table. The raw token is never logged or returned via API.

## Configuration Fields

| Field | Description |
|-------|-------------|
| `name` | Friendly name for this configuration (e.g. "Production Jira") |
| `base_url` | Root URL of Jira instance |
| `email` | Atlassian account email for API auth |
| `api_token` | Fernet-encrypted API token |
| `project_key` | Project key prefix (e.g. `PROJ`) used for validation |
| `is_active` | Only active configs are used for status polling |

## Task Linking

Tasks in the Kanban board have an optional `jira_ticket` field (e.g. `PROJ-123`). When set:
- The Jira issue status is cached in `tasks.jira_status`
- Cache TTL: **30 minutes**
- A `JiraStatusBadge` component displays the status with color coding
- If the cache is stale (no refresh in >30 min), a `jira_stale: true` flag is shown

## Status Polling

### Individual Fetch
`GET /api/v1/kanban/tasks/{id}/jira` — returns live status (bypasses cache for that one request).

### Bulk Update
`POST /api/v1/kanban/tasks/bulk-update-jira` — refreshes all tasks with Jira tickets in parallel (manager+).

### Scheduled Refresh
Celery Beat runs a daily bulk refresh at 06:00 to keep statuses reasonably fresh at the start of the workday.

## Error Handling

- If the active Jira config is missing or connection fails, tasks display their last known cached status with `jira_stale: true`.
- `POST /api/v1/jira/configs/{id}/test` returns a `200` with `{ "ok": true, "projects": [...] }` on success or a descriptive error on failure.
- 401 from Jira: token likely revoked; admin must update the API token.
- 429 from Jira: back-off applied; bulk update retried by Celery.

## Encryption Details

```python
from cryptography.fernet import Fernet

key = settings.JIRA_ENCRYPTION_KEY.encode()  # from env
f = Fernet(key)
encrypted_token = f.encrypt(raw_token.encode()).decode()  # stored in DB
raw_token = f.decrypt(stored_token.encode()).decode()     # decrypted on use
```

## Adding a New Jira Config

1. Go to **Settings → Jira** in the admin UI.
2. Click **Add Configuration**.
3. Fill in Base URL, email, API token, and project key.
4. Click **Test Connection** — verify the response shows your project.
5. Toggle **Active**.
