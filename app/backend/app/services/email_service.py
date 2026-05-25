import uuid
from datetime import datetime, timezone
from typing import Optional
from jinja2 import Environment, BaseLoader, TemplateError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.email_config import SmtpConfig
from app.models.email_template import EmailTemplate
from app.models.email_workflow import EmailWorkflow
from app.models.email_log import EmailLog
from app.models.user import User
from app.core.security import encrypt_field, decrypt_field
from app.config import settings
from app.core.exceptions import NotFoundError, ValidationError, ConflictError


class EmailService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── SMTP Config ─────────────────────────────────────────────────────────

    async def get_smtp_config(self) -> Optional[SmtpConfig]:
        result = await self.db.execute(select(SmtpConfig).where(SmtpConfig.is_active == True).limit(1))
        return result.scalar_one_or_none()

    async def list_smtp_configs(self) -> list[SmtpConfig]:
        result = await self.db.execute(select(SmtpConfig).order_by(SmtpConfig.created_at))
        return list(result.scalars().all())

    async def create_smtp_config(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        use_tls: bool,
        from_email: str,
        from_name: str,
    ) -> SmtpConfig:
        cfg = SmtpConfig(
            host=host,
            port=port,
            username=username,
            password_encrypted=encrypt_field(password, settings.SMTP_ENCRYPTION_KEY),
            use_tls=use_tls,
            from_email=from_email,
            from_name=from_name,
        )
        self.db.add(cfg)
        await self.db.flush()
        return cfg

    async def update_smtp_config(
        self,
        config_id: uuid.UUID,
        host: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        use_tls: Optional[bool] = None,
        from_email: Optional[str] = None,
        from_name: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> SmtpConfig:
        result = await self.db.execute(select(SmtpConfig).where(SmtpConfig.id == config_id))
        cfg = result.scalar_one_or_none()
        if not cfg:
            raise NotFoundError("SMTP yapılandırması")
        if host is not None: cfg.host = host
        if port is not None: cfg.port = port
        if username is not None: cfg.username = username
        if password is not None: cfg.password_encrypted = encrypt_field(password, settings.SMTP_ENCRYPTION_KEY)
        if use_tls is not None: cfg.use_tls = use_tls
        if from_email is not None: cfg.from_email = from_email
        if from_name is not None: cfg.from_name = from_name
        if is_active is not None: cfg.is_active = is_active
        await self.db.flush()
        return cfg

    async def test_smtp_config(self, config_id: uuid.UUID, to_email: str) -> dict:
        """Send a test email via the given SMTP config and return success/error info."""
        import smtplib
        import ssl as ssl_lib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        result = await self.db.execute(select(SmtpConfig).where(SmtpConfig.id == config_id))
        cfg = result.scalar_one_or_none()
        if not cfg:
            raise NotFoundError("SMTP yapılandırması")

        password = decrypt_field(cfg.password_encrypted, settings.SMTP_ENCRYPTION_KEY)

        subject = "Test E-postası — TeamApp"
        html_body = (
            "<h2>SMTP Test</h2>"
            "<p>Bu e-posta, SMTP yapılandırmanızın doğruluğunu test etmek için gönderilmiştir.</p>"
            f"<p><strong>Host:</strong> {cfg.host}:{cfg.port}</p>"
            f"<p><strong>Gönderen:</strong> {cfg.from_name} &lt;{cfg.from_email}&gt;</p>"
        )

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{cfg.from_name} <{cfg.from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        def _send_sync():
            if cfg.use_tls:
                context = ssl_lib.create_default_context()
                with smtplib.SMTP(cfg.host, cfg.port, timeout=10) as server:
                    server.ehlo()
                    server.starttls(context=context)
                    server.login(cfg.username, password)
                    server.sendmail(cfg.from_email, [to_email], msg.as_bytes())
            else:
                with smtplib.SMTP(cfg.host, cfg.port, timeout=10) as server:
                    server.login(cfg.username, password)
                    server.sendmail(cfg.from_email, [to_email], msg.as_bytes())

        import asyncio
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, _send_sync)
            return {"success": True, "message": f"Test e-postası {to_email} adresine başarıyla gönderildi."}
        except smtplib.SMTPAuthenticationError as e:
            return {"success": False, "message": f"Kimlik doğrulama hatası: {e.smtp_error.decode() if isinstance(e.smtp_error, bytes) else str(e)}"}
        except smtplib.SMTPConnectError as e:
            return {"success": False, "message": f"Bağlantı hatası: {e}"}
        except smtplib.SMTPException as e:
            return {"success": False, "message": f"SMTP hatası: {e}"}
        except OSError as e:
            return {"success": False, "message": f"Ağ hatası: {e}"}

    # ─── Email Templates ──────────────────────────────────────────────────────

    async def list_templates(self) -> list[EmailTemplate]:
        result = await self.db.execute(select(EmailTemplate).order_by(EmailTemplate.name))
        return list(result.scalars().all())

    async def get_template(self, template_id: uuid.UUID) -> EmailTemplate:
        result = await self.db.execute(select(EmailTemplate).where(EmailTemplate.id == template_id))
        tmpl = result.scalar_one_or_none()
        if not tmpl:
            raise NotFoundError("E-posta şablonu")
        return tmpl

    async def get_template_by_slug(self, slug: str) -> Optional[EmailTemplate]:
        result = await self.db.execute(select(EmailTemplate).where(EmailTemplate.slug == slug))
        return result.scalar_one_or_none()

    async def create_template(
        self,
        name: str,
        slug: str,
        subject: str,
        html_body: str,
        available_vars: Optional[dict] = None,
        is_system: bool = False,
    ) -> EmailTemplate:
        existing = await self.db.execute(select(EmailTemplate).where(EmailTemplate.slug == slug))
        if existing.scalar_one_or_none():
            raise ConflictError("Bu slug ile zaten bir şablon var.")
        tmpl = EmailTemplate(
            name=name, slug=slug, subject=subject, html_body=html_body,
            available_vars=available_vars, is_system=is_system
        )
        self.db.add(tmpl)
        await self.db.flush()
        return tmpl

    async def update_template(
        self,
        template_id: uuid.UUID,
        name: Optional[str] = None,
        subject: Optional[str] = None,
        html_body: Optional[str] = None,
        available_vars: Optional[dict] = None,
    ) -> EmailTemplate:
        tmpl = await self.get_template(template_id)
        if name is not None: tmpl.name = name
        if subject is not None: tmpl.subject = subject
        if html_body is not None: tmpl.html_body = html_body
        if available_vars is not None: tmpl.available_vars = available_vars
        await self.db.flush()
        return tmpl

    async def delete_template(self, template_id: uuid.UUID) -> None:
        tmpl = await self.get_template(template_id)
        if tmpl.is_system:
            raise ValidationError("Sistem şablonları silinemez.")
        await self.db.delete(tmpl)
        await self.db.flush()

    async def preview_template(self, template_id: uuid.UUID, variables: dict) -> str:
        tmpl = await self.get_template(template_id)
        try:
            env = Environment(loader=BaseLoader())
            html = env.from_string(tmpl.html_body).render(**variables)
            return html
        except TemplateError as e:
            raise ValidationError(f"Şablon render hatası: {e}")

    # ─── Email Workflows ──────────────────────────────────────────────────────

    async def list_workflows(self) -> list[EmailWorkflow]:
        result = await self.db.execute(select(EmailWorkflow).order_by(EmailWorkflow.name))
        return list(result.scalars().all())

    async def get_workflow(self, workflow_id: uuid.UUID) -> EmailWorkflow:
        result = await self.db.execute(select(EmailWorkflow).where(EmailWorkflow.id == workflow_id))
        wf = result.scalar_one_or_none()
        if not wf:
            raise NotFoundError("E-posta iş akışı")
        return wf

    async def create_workflow(
        self,
        name: str,
        trigger_type: str,
        template_id: uuid.UUID,
        recipient_type: str,
        trigger_config: Optional[dict] = None,
        condition_config: Optional[dict] = None,
        recipient_users: Optional[list] = None,
        send_teams: bool = False,
        teams_webhook_id: Optional[uuid.UUID] = None,
    ) -> EmailWorkflow:
        # Verify template exists
        await self.get_template(template_id)
        wf = EmailWorkflow(
            name=name,
            trigger_type=trigger_type,
            template_id=template_id,
            recipient_type=recipient_type,
            trigger_config=trigger_config,
            condition_config=condition_config,
            recipient_users=recipient_users,
            send_teams=send_teams,
            teams_webhook_id=teams_webhook_id,
        )
        self.db.add(wf)
        await self.db.flush()
        return wf

    async def update_workflow(
        self,
        workflow_id: uuid.UUID,
        name: Optional[str] = None,
        trigger_config: Optional[dict] = None,
        condition_config: Optional[dict] = None,
        template_id: Optional[uuid.UUID] = None,
        recipient_type: Optional[str] = None,
        recipient_users: Optional[list] = None,
        send_teams: Optional[bool] = None,
        teams_webhook_id: Optional[uuid.UUID] = None,
        is_active: Optional[bool] = None,
    ) -> EmailWorkflow:
        wf = await self.get_workflow(workflow_id)
        if name is not None: wf.name = name
        if trigger_config is not None: wf.trigger_config = trigger_config
        if condition_config is not None: wf.condition_config = condition_config
        if template_id is not None: wf.template_id = template_id
        if recipient_type is not None: wf.recipient_type = recipient_type
        if recipient_users is not None: wf.recipient_users = recipient_users
        if send_teams is not None: wf.send_teams = send_teams
        if teams_webhook_id is not None: wf.teams_webhook_id = teams_webhook_id
        if is_active is not None: wf.is_active = is_active
        await self.db.flush()
        return wf

    async def delete_workflow(self, workflow_id: uuid.UUID) -> None:
        wf = await self.get_workflow(workflow_id)
        await self.db.delete(wf)
        await self.db.flush()

    async def toggle_workflow(self, workflow_id: uuid.UUID) -> EmailWorkflow:
        wf = await self.get_workflow(workflow_id)
        wf.is_active = not wf.is_active
        await self.db.flush()
        return wf

    # ─── Email Logs ───────────────────────────────────────────────────────────

    async def list_logs(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
    ) -> tuple[list[EmailLog], int]:
        q = select(EmailLog)
        if status:
            q = q.where(EmailLog.status == status)
        total = (await self.db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        q = q.order_by(EmailLog.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def create_log_entry(
        self,
        to_email: str,
        subject: str,
        workflow_id: Optional[uuid.UUID] = None,
        template_id: Optional[uuid.UUID] = None,
        recipient_id: Optional[uuid.UUID] = None,
    ) -> EmailLog:
        log = EmailLog(
            workflow_id=workflow_id,
            template_id=template_id,
            recipient_id=recipient_id,
            to_email=to_email,
            subject=subject,
            status="pending",
        )
        self.db.add(log)
        await self.db.flush()
        return log

    async def already_sent_today(
        self, workflow_id: uuid.UUID, recipient_id: uuid.UUID
    ) -> bool:
        from datetime import date
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        result = await self.db.execute(
            select(func.count()).where(
                EmailLog.workflow_id == workflow_id,
                EmailLog.recipient_id == recipient_id,
                EmailLog.status == "sent",
                EmailLog.sent_at >= today_start,
            )
        )
        return result.scalar_one() > 0

    # ─── Rendering ────────────────────────────────────────────────────────────

    def render_template(self, template: EmailTemplate, variables: dict) -> tuple[str, str]:
        env = Environment(loader=BaseLoader(), autoescape=True)
        subject = env.from_string(template.subject).render(**variables)
        html_body = env.from_string(template.html_body).render(**variables)
        return subject, html_body
