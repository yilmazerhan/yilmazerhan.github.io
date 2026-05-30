from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.worklog import WorkType
from app.models.kanban import KanbanBoard, KanbanColumn
from app.models.app_setting import AppSetting
from app.models.email_template import EmailTemplate
from app.core.security import hash_password
from app.config import settings


DEFAULT_WORK_TYPES = [
    {"name": "Müşteri Toplantısı", "color": "#3b82f6", "sort_order": 1, "name_key": "worklog.wt_client_meeting"},
    {"name": "Sunum Hazırlığı", "color": "#8b5cf6", "sort_order": 2, "name_key": "worklog.wt_presentation"},
    {"name": "Production Bug İncelemesi", "color": "#ef4444", "sort_order": 3, "name_key": "worklog.wt_bug_review"},
    {"name": "Analiz", "color": "#f59e0b", "sort_order": 4, "name_key": "worklog.wt_analysis"},
    {"name": "Geliştirme", "color": "#10b981", "sort_order": 5, "name_key": "worklog.wt_development"},
    {"name": "Test", "color": "#06b6d4", "sort_order": 6, "name_key": "worklog.wt_testing"},
    {"name": "Release Testi", "color": "#f97316", "sort_order": 7, "name_key": "worklog.wt_release_testing"},
    {"name": "Dokümantasyon", "color": "#6366f1", "sort_order": 8, "name_key": "worklog.wt_documentation"},
    {"name": "Code Review", "color": "#84cc16", "sort_order": 9, "name_key": "worklog.wt_code_review"},
    {"name": "Eğitim / Araştırma", "color": "#ec4899", "sort_order": 10, "name_key": "worklog.wt_training"},
]

DEFAULT_KANBAN_COLUMNS = [
    {"name": "Bekleyen", "color": "#e2e8f0", "sort_order": 0, "is_terminal": False, "name_key": "kanban.col_pending"},
    {"name": "Devam Ediyor", "color": "#bfdbfe", "sort_order": 1, "is_terminal": False, "name_key": "kanban.col_in_progress"},
    {"name": "İncelemede", "color": "#fef9c3", "sort_order": 2, "is_terminal": False, "name_key": "kanban.col_in_review"},
    {"name": "Tamamlandı", "color": "#bbf7d0", "sort_order": 3, "is_terminal": True, "name_key": "kanban.col_done"},
]

DEFAULT_APP_SETTINGS = {
    "company_name": "Şirket Adı",
    "company_logo": "",
    "primary_color": "#3b82f6",
}


async def seed_initial_data(db: AsyncSession) -> None:
    await _seed_superadmin(db)
    await _seed_work_types(db)
    await _seed_kanban_columns(db)
    await _seed_app_settings(db)
    await _seed_email_templates(db)
    await db.commit()


async def _seed_superadmin(db: AsyncSession) -> None:
    if not settings.SUPERADMIN_PASSWORD:
        return

    result = await db.execute(select(User).where(User.role == "superadmin").limit(1))
    if result.scalar_one_or_none():
        return

    admin = User(
        email=settings.SUPERADMIN_EMAIL.lower(),
        username="superuser",  # Default superadmin username is always "superuser"
        hashed_password=hash_password(settings.SUPERADMIN_PASSWORD),
        full_name=settings.SUPERADMIN_FULL_NAME,
        role="superadmin",
        is_active=True,
    )
    db.add(admin)


async def _seed_work_types(db: AsyncSession) -> None:
    result = await db.execute(select(WorkType).limit(1))
    if result.scalar_one_or_none():
        return

    for wt in DEFAULT_WORK_TYPES:
        db.add(WorkType(**wt))


async def _seed_kanban_columns(db: AsyncSession) -> None:
    result = await db.execute(select(KanbanColumn).limit(1))
    if result.scalar_one_or_none():
        return

    # Ensure a default board exists first
    board_result = await db.execute(select(KanbanBoard).limit(1))
    board = board_result.scalar_one_or_none()
    if not board:
        board = KanbanBoard(name="Genel", description="Varsayılan kanban panosu", color="#6366f1")
        db.add(board)
        await db.flush()

    for col in DEFAULT_KANBAN_COLUMNS:
        db.add(KanbanColumn(**col, board_id=board.id))


async def _seed_app_settings(db: AsyncSession) -> None:
    for key, value in DEFAULT_APP_SETTINGS.items():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        if not result.scalar_one_or_none():
            db.add(AppSetting(key=key, value=value))


SYSTEM_EMAIL_TEMPLATES = [
    {
        "name": "Yeni Hesap Bilgileri",
        "slug": "new_account",
        "subject": "{% if app_name %}{{ app_name }} — {% endif %}Hesabınız Oluşturuldu",
        "html_body": """<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
{% if app_name %}<p style="font-size:1.1em;font-weight:bold;color:#1d4ed8;">{{ app_name }}</p>{% endif %}
<h2 style="color:#111827;">Merhaba {{ full_name }},</h2>
<p>Hesabınız oluşturuldu. Aşağıdaki bilgilerle giriş yapabilirsiniz:</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Kullanıcı Adı:</td><td style="padding:4px 0;font-family:monospace;font-size:1.1em;">{{ username }}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Geçici Şifre:</td><td style="padding:4px 0;font-family:monospace;font-size:1.1em;">{{ temp_password }}</td></tr>
</table>
<p><a href="{{ login_url }}" style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Giriş Yap</a></p>
{% if app_url %}<p style="color:#6b7280;font-size:0.9em;">Uygulama adresi: <a href="{{ app_url }}" style="color:#3b82f6;">{{ app_url }}</a></p>{% endif %}
<p style="color:#6b7280;font-size:0.9em;">Güvenliğiniz için ilk girişinizde şifrenizi değiştirmenizi öneririz.</p>
</div>""",
        "available_vars": {
            "full_name": "Kullanıcı adı",
            "username": "Kullanıcı adı",
            "temp_password": "Geçici şifre",
            "login_url": "Giriş URL",
            "app_name": "Uygulama adı (otomatik)",
            "app_url": "Uygulama URL (otomatik)",
        },
        "is_system": True,
    },
    {
        "name": "Hesap Aktivasyonu",
        "slug": "account_activation",
        "subject": "Hesabınızı Aktive Edin",
        "html_body": """<h2>Merhaba {{ full_name }},</h2>
<p>Hesabınız oluşturuldu. Aşağıdaki bağlantıya tıklayarak hesabınızı aktive edin:</p>
<p><a href="{{ activation_url }}" style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Hesabı Aktive Et</a></p>
<p>Bu bağlantı {{ expires_in }} saat geçerlidir.</p>""",
        "available_vars": {"full_name": "Kullanıcı adı", "activation_url": "Aktivasyon URL", "expires_in": "Süre (saat)"},
        "is_system": True,
    },
    {
        "name": "Şifre Sıfırlama",
        "slug": "password_reset",
        "subject": "Şifrenizi Sıfırlayın",
        "html_body": """<h2>Merhaba {{ full_name }},</h2>
<p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{ reset_url }}" style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Şifremi Sıfırla</a></p>
<p>Bu bağlantı {{ expires_in }} saat geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı görmezden gelin.</p>""",
        "available_vars": {"full_name": "Kullanıcı adı", "reset_url": "Sıfırlama URL", "expires_in": "Süre (saat)"},
        "is_system": True,
    },
    {
        "name": "Görev Yaklaşan Bitiş",
        "slug": "task_due_soon",
        "subject": "Görev Bitiş Tarihi Yaklaşıyor: {{ task_title }}",
        "html_body": """<h2>Merhaba {{ assignee_name }},</h2>
<p><strong>{{ task_title }}</strong> görevi <strong>{{ due_date }}</strong> tarihinde bitiyor.</p>
<p>Öncelik: {{ priority }}</p>""",
        "available_vars": {"task_title": "Görev başlığı", "due_date": "Bitiş tarihi", "assignee_name": "Atanan adı", "priority": "Öncelik"},
        "is_system": False,
    },
    {
        "name": "Görev Gecikti",
        "slug": "task_overdue",
        "subject": "Gecikmiş Görev: {{ task_title }}",
        "html_body": """<h2>Merhaba {{ assignee_name }},</h2>
<p><strong>{{ task_title }}</strong> görevi <strong>{{ due_date }}</strong> tarihinde bitmesi gerekiyordu ancak henüz tamamlanmadı.</p>""",
        "available_vars": {"task_title": "Görev başlığı", "due_date": "Bitiş tarihi", "assignee_name": "Atanan adı"},
        "is_system": False,
    },
    {
        "name": "İş Günlüğü Hatırlatıcı",
        "slug": "worklog_reminder",
        "subject": "Bugünkü İş Günlüğünüzü Girmeyi Unutmayın",
        "html_body": """<h2>Merhaba {{ user_name }},</h2>
<p>{{ date }} tarihli iş günlüğünüzü henüz girmediniz. Lütfen bugün yaptığınız çalışmaları kaydedin.</p>""",
        "available_vars": {"user_name": "Kullanıcı adı", "date": "Tarih"},
        "is_system": False,
    },
    {
        "name": "Görev Atandı",
        "slug": "task_assigned",
        "subject": "Size Yeni Bir Görev Atandı: {{ task_title }}",
        "html_body": """<h2>Merhaba {{ assignee_name }},</h2>
<p>Size <strong>{{ task_title }}</strong> görevi atandı.</p>
{% if due_date %}<p>Bitiş Tarihi: {{ due_date }}</p>{% endif %}
<p>Öncelik: {{ priority }}</p>""",
        "available_vars": {"task_title": "Görev başlığı", "assignee_name": "Atanan adı", "due_date": "Bitiş tarihi (isteğe bağlı)", "priority": "Öncelik"},
        "is_system": False,
    },
]


async def _seed_email_templates(db: AsyncSession) -> None:
    for tmpl_data in SYSTEM_EMAIL_TEMPLATES:
        result = await db.execute(select(EmailTemplate).where(EmailTemplate.slug == tmpl_data["slug"]))
        existing = result.scalar_one_or_none()
        if existing:
            # Keep system templates in sync with code — update subject/body/vars
            if existing.is_system:
                existing.name = tmpl_data["name"]
                existing.subject = tmpl_data["subject"]
                existing.html_body = tmpl_data["html_body"]
                existing.available_vars = tmpl_data["available_vars"]
        else:
            db.add(EmailTemplate(**tmpl_data))
