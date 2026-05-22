# Database Schema

PostgreSQL 15. All primary keys are UUIDs generated with `gen_random_uuid()`. All timestamps are `TIMESTAMPTZ`.

## Tables

### users
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
email           VARCHAR(255) UNIQUE NOT NULL
hashed_password VARCHAR(255) NOT NULL           -- Argon2id
full_name       VARCHAR(255) NOT NULL
role            VARCHAR(20) DEFAULT 'user'       -- 'superadmin' | 'team_manager' | 'user'
team_id         UUID REFERENCES teams(id) NULLABLE
preferred_language VARCHAR(5) DEFAULT 'tr'
is_active       BOOLEAN DEFAULT FALSE            -- activated via email link
is_deleted      BOOLEAN DEFAULT FALSE            -- soft delete
last_login_at   TIMESTAMPTZ NULLABLE
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

### teams
```sql
id          UUID PRIMARY KEY
name        VARCHAR(100) NOT NULL
description TEXT NULLABLE
manager_id  UUID REFERENCES users(id) NULLABLE
is_active   BOOLEAN DEFAULT TRUE
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```

### permission_overrides
```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES users(id) NOT NULL
module      VARCHAR(50) NOT NULL   -- 'worklog' | 'kanban' | 'user_management' | 'email_workflows' | 'jira_config'
action      VARCHAR(20) NOT NULL   -- 'create' | 'edit' | 'delete' | 'view'
is_allowed  BOOLEAN NOT NULL       -- TRUE = grant, FALSE = deny
created_by  UUID REFERENCES users(id)
created_at  TIMESTAMPTZ DEFAULT now()
UNIQUE(user_id, module, action)
```

### work_types
```sql
id         UUID PRIMARY KEY
name       VARCHAR(100) NOT NULL UNIQUE
color      VARCHAR(7) DEFAULT '#6366f1'
is_active  BOOLEAN DEFAULT TRUE
sort_order INTEGER DEFAULT 0
created_by UUID REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT now()
updated_at TIMESTAMPTZ DEFAULT now()
```

### work_logs
```sql
id             UUID PRIMARY KEY
user_id        UUID REFERENCES users(id) NOT NULL
work_type_id   UUID REFERENCES work_types(id) NOT NULL
log_date       DATE NOT NULL
duration_hours NUMERIC(4,2) NOT NULL   -- e.g. 1.5
description    TEXT NOT NULL
created_at     TIMESTAMPTZ DEFAULT now()
updated_at     TIMESTAMPTZ DEFAULT now()

INDEX(user_id, log_date)
INDEX(log_date)
```

### kanban_columns
```sql
id          UUID PRIMARY KEY
name        VARCHAR(100) NOT NULL
color       VARCHAR(7) DEFAULT '#e2e8f0'
sort_order  INTEGER NOT NULL
is_terminal BOOLEAN DEFAULT FALSE   -- "Done"-type columns
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```

### tasks
```sql
id                     UUID PRIMARY KEY
title                  VARCHAR(255) NOT NULL
description            TEXT NULLABLE
assignee_id            UUID REFERENCES users(id) NULLABLE
created_by             UUID REFERENCES users(id) NOT NULL
column_id              UUID REFERENCES kanban_columns(id) NOT NULL
priority               VARCHAR(20) DEFAULT 'medium'   -- 'low' | 'medium' | 'high' | 'critical'
due_date               DATE NULLABLE
jira_ticket            VARCHAR(50) NULLABLE            -- e.g. PROJ-123
jira_status            VARCHAR(100) NULLABLE           -- cached from Jira
jira_status_updated_at TIMESTAMPTZ NULLABLE
sort_order             INTEGER DEFAULT 0
is_archived            BOOLEAN DEFAULT FALSE
created_at             TIMESTAMPTZ DEFAULT now()
updated_at             TIMESTAMPTZ DEFAULT now()

INDEX(assignee_id)
INDEX(column_id, sort_order)
INDEX(due_date)
```

### jira_configs
```sql
id          UUID PRIMARY KEY
name        VARCHAR(100) NOT NULL
base_url    VARCHAR(500) NOT NULL       -- https://company.atlassian.net
api_token   TEXT NOT NULL               -- Fernet encrypted
email       VARCHAR(255) NOT NULL
project_key VARCHAR(50) NOT NULL
is_active   BOOLEAN DEFAULT TRUE
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```

### smtp_configs
```sql
id         UUID PRIMARY KEY
host       VARCHAR(255) NOT NULL
port       INTEGER DEFAULT 587
username   VARCHAR(255) NOT NULL
password   TEXT NOT NULL               -- Fernet encrypted
use_tls    BOOLEAN DEFAULT TRUE
from_email VARCHAR(255) NOT NULL
from_name  VARCHAR(100) DEFAULT 'Team App'
is_active  BOOLEAN DEFAULT TRUE
created_at TIMESTAMPTZ DEFAULT now()
updated_at TIMESTAMPTZ DEFAULT now()
```

### email_templates
```sql
id             UUID PRIMARY KEY
name           VARCHAR(100) NOT NULL UNIQUE
slug           VARCHAR(100) NOT NULL UNIQUE
subject        VARCHAR(500) NOT NULL     -- Jinja2 template string
html_body      TEXT NOT NULL             -- Jinja2 HTML template
available_vars JSONB                     -- variable documentation
is_system      BOOLEAN DEFAULT FALSE     -- system templates cannot be deleted
created_at     TIMESTAMPTZ DEFAULT now()
updated_at     TIMESTAMPTZ DEFAULT now()
```

### email_workflows
```sql
id               UUID PRIMARY KEY
name             VARCHAR(100) NOT NULL
is_active        BOOLEAN DEFAULT TRUE
trigger_type     VARCHAR(50) NOT NULL
                 -- 'task_due_soon' | 'task_overdue' | 'task_status_changed'
                 -- 'worklog_reminder' | 'task_assigned'
                 -- 'account_activation' | 'password_reset'
trigger_config   JSONB    -- e.g. {"days_before": 3}
condition_config JSONB    -- e.g. {"priority": ["high","critical"]}
template_id      UUID REFERENCES email_templates(id)
recipient_type   VARCHAR(30) NOT NULL
                 -- 'assignee' | 'team_manager' | 'all_managers'
                 -- 'specific_users' | 'creator'
recipient_users  JSONB    -- UUID list for 'specific_users'
last_run_at      TIMESTAMPTZ NULLABLE
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
```

### email_logs
```sql
id           UUID PRIMARY KEY
workflow_id  UUID REFERENCES email_workflows(id) NULLABLE
template_id  UUID REFERENCES email_templates(id) NULLABLE
recipient_id UUID REFERENCES users(id) NULLABLE
to_email     VARCHAR(255) NOT NULL
subject      VARCHAR(500) NOT NULL
status       VARCHAR(20) DEFAULT 'pending'   -- 'pending' | 'sent' | 'failed'
error_message TEXT NULLABLE
sent_at      TIMESTAMPTZ NULLABLE
created_at   TIMESTAMPTZ DEFAULT now()

INDEX(recipient_id, created_at)
INDEX(status, created_at)
```

### audit_logs
```sql
id         UUID PRIMARY KEY
user_id    UUID REFERENCES users(id) NULLABLE
action     VARCHAR(20) NOT NULL   -- 'create' | 'update' | 'delete'
table_name VARCHAR(100) NOT NULL
record_id  UUID NOT NULL
old_data   JSONB NULLABLE
new_data   JSONB NULLABLE
ip_address INET NULLABLE
user_agent TEXT NULLABLE
created_at TIMESTAMPTZ DEFAULT now()

INDEX(table_name, record_id)
INDEX(user_id, created_at)
```

### refresh_tokens
```sql
id         UUID PRIMARY KEY
user_id    UUID REFERENCES users(id) NOT NULL
token_hash VARCHAR(255) NOT NULL UNIQUE   -- SHA-256 of raw token
expires_at TIMESTAMPTZ NOT NULL
revoked    BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ DEFAULT now()
```

### password_reset_tokens
```sql
id         UUID PRIMARY KEY
user_id    UUID REFERENCES users(id) NOT NULL
token_hash VARCHAR(255) NOT NULL UNIQUE
expires_at TIMESTAMPTZ NOT NULL
used       BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ DEFAULT now()
```

### ssl_certificates
```sql
id          UUID PRIMARY KEY
name        VARCHAR(100) NOT NULL
cert_pem    BYTEA NOT NULL
key_pem     BYTEA NOT NULL          -- Fernet encrypted
expires_at  TIMESTAMPTZ NOT NULL
is_active   BOOLEAN DEFAULT FALSE
uploaded_by UUID REFERENCES users(id)
created_at  TIMESTAMPTZ DEFAULT now()
```

### app_settings
```sql
key        VARCHAR(100) PRIMARY KEY   -- 'company_name' | 'company_logo' | 'primary_color'
value      TEXT NOT NULL              -- JSON or plain text; logo as base64 or file path
updated_by UUID REFERENCES users(id)
updated_at TIMESTAMPTZ DEFAULT now()
```

### teams_webhook_configs
```sql
id          UUID PRIMARY KEY
name        VARCHAR(100) NOT NULL
webhook_url TEXT NOT NULL            -- Fernet encrypted
is_active   BOOLEAN DEFAULT TRUE
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```

## Migration Strategy

Alembic manages all schema changes. The migration container (`migration` service in docker-compose) runs `alembic upgrade head` on every deployment before the backend starts, ensuring zero-downtime schema updates.
