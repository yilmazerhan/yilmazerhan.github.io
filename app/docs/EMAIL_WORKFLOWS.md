# Email Workflow System

## Architecture

```
Celery Beat (15 min) ──► evaluate_all_workflows()
                              │
                    ┌─────────┴──────────┐
                    │                    │
          send_email.apply_async()   send_teams_message.apply_async()
                    │
        Jinja2 render → SMTP → email_logs (status=sent|failed)
```

## Trigger Types

| Trigger | Evaluation | Description |
|---------|-----------|-------------|
| `task_due_soon` | Every 15 min | Tasks with `due_date = TODAY + N days` where N from `trigger_config.days_before` |
| `task_overdue` | Every 15 min | Non-terminal column tasks past `due_date` |
| `task_status_changed` | Event-driven | Fired immediately when task moves to new column |
| `task_assigned` | Event-driven | Fired immediately when `assignee_id` changes |
| `worklog_reminder` | Daily at 17:00 | Users with no `work_log` entry for today |
| `account_activation` | Event-driven | On `POST /auth/register` |
| `password_reset` | Event-driven | On `POST /auth/forgot-password` |

## Recipient Types

| Type | Resolution |
|------|-----------|
| `assignee` | Task's current assignee |
| `creator` | User who created the task |
| `team_manager` | Manager of the assignee's team |
| `all_managers` | All users with `role = 'team_manager'` or `'superadmin'` |
| `specific_users` | UUID list stored in `recipient_users` JSONB |

## Trigger Config Examples

```json
// task_due_soon — notify 3 days before due date
{ "days_before": 3 }

// task_due_soon — notify 1 day before
{ "days_before": 1 }

// worklog_reminder — only on weekdays
{ "weekdays_only": true }
```

## Condition Config Examples

```json
// Only trigger for high/critical priority tasks
{ "priority": ["high", "critical"] }

// Only trigger for tasks in specific columns
{ "column_ids": ["uuid1", "uuid2"] }
```

## Duplication Prevention

Before sending, the system queries `email_logs` to check if the same `workflow_id + recipient + task/date` combination was already sent today. If found, the send is skipped silently.

## Template Variables

All templates receive these base variables:

| Variable | Source |
|----------|--------|
| `company_name` | `app_settings` |
| `company_logo_url` | `app_settings` |
| `frontend_url` | `settings.FRONTEND_URL` |
| `recipient_name` | Recipient user's `full_name` |
| `recipient_email` | Recipient user's `email` |

Task-related workflows additionally receive:

| Variable | Source |
|----------|--------|
| `task_title` | `tasks.title` |
| `task_url` | Constructed from `frontend_url + /kanban?task={id}` |
| `task_priority` | `tasks.priority` |
| `task_due_date` | `tasks.due_date` formatted |
| `assignee_name` | `users.full_name` |
| `column_name` | `kanban_columns.name` |

Auth workflows:

| Variable | Source |
|----------|--------|
| `activation_url` | `frontend_url/activate/{token}` |
| `reset_url` | `frontend_url/reset-password?token={token}` |
| `expires_in_hours` | From settings |

## System Templates (Protected — Cannot Be Deleted)

| Slug | Trigger |
|------|---------|
| `account-activation` | account_activation |
| `password-reset` | password_reset |
| `task-due-soon` | task_due_soon |
| `task-overdue` | task_overdue |
| `task-assigned` | task_assigned |
| `worklog-reminder` | worklog_reminder |

## Microsoft Teams Integration

Each workflow can optionally send a parallel Teams notification via Incoming Webhook.

Teams messages use **Adaptive Cards** format for rich display. The payload includes:
- Title (card heading)
- Task/event details in a FactSet
- Action button linking to the relevant page

Configure webhook URLs under `Settings → Teams Webhooks`. URLs are Fernet-encrypted in the database.

## Failure Handling

- Celery retries email tasks up to **3 times** with exponential backoff (2s, 4s, 8s).
- After all retries exhausted, `email_logs.status` is set to `'failed'` with `error_message`.
- Template rendering errors are caught and logged without propagating — other workflow recipients still receive their emails.
- SMTP connection failures trigger the retry chain; DNS/delivery failures log immediately.
