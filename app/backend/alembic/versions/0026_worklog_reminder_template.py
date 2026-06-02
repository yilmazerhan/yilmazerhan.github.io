"""seed worklog_reminder email template

Revision ID: 0026_worklog_reminder_template
Revises: 0025_customers_table
Create Date: 2026-06-02
"""
from alembic import op

revision = "0026_worklog_reminder_template"
down_revision = "0025_customers_table"
branch_labels = None
depends_on = None


_SUBJECT = "{{ date }} — İş Günlüğü Hatırlatması"

_HTML_BODY = """\
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>İş Günlüğü Hatırlatması</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:8px;overflow:hidden;
                    box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:#6366f1;padding:24px 32px;">
            <h1 style="color:#ffffff;margin:0;font-size:20px;">İş Günlüğü Hatırlatması</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:#374151;font-size:15px;margin:0 0 16px;">
              Merhaba <strong>{{ user_name }}</strong>,
            </p>
            <p style="color:#374151;font-size:15px;margin:0 0 16px;">
              <strong>{{ date }}</strong> tarihi için henüz iş günlüğü kaydı girmediniz.
              Lütfen bugünkü çalışmalarınızı sisteme kaydediniz.
            </p>
            <p style="color:#374151;font-size:15px;margin:0;">
              İyi çalışmalar,<br>
              Ekip Yönetim Sistemi
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">
              Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayınız.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

_AVAILABLE_VARS = '{"user_name": "Kullanıcının tam adı", "date": "Günün tarihi (YYYY-AA-GG)"}'


def upgrade():
    op.execute(f"""
        INSERT INTO email_templates (id, name, slug, subject, html_body, available_vars, is_system, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'İş Günlüğü Hatırlatması',
            'worklog_reminder',
            {repr(_SUBJECT)},
            {repr(_HTML_BODY)},
            '{_AVAILABLE_VARS}'::jsonb,
            TRUE,
            NOW(),
            NOW()
        )
        ON CONFLICT (slug) DO NOTHING
    """)


def downgrade():
    op.execute("DELETE FROM email_templates WHERE slug = 'worklog_reminder' AND is_system = TRUE")
