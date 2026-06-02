from datetime import datetime, date, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

_ISTANBUL = ZoneInfo("Europe/Istanbul")


def _at_istanbul_hour(d: date, h: int) -> datetime:
    """Return a UTC-aware datetime representing date d at hour h in Istanbul time."""
    naive = datetime(d.year, d.month, d.day, h, 0, 0)
    return naive.replace(tzinfo=_ISTANBUL).astimezone(timezone.utc)


def compute_next_run(
    frequency: str,
    day_of_week: Optional[int],
    day_of_month: Optional[int],
    hour: int,
) -> Optional[datetime]:
    """Compute next run datetime (UTC-aware) for a schedule whose hour is in Istanbul time."""
    now = datetime.now(timezone.utc)
    now_local = now.astimezone(_ISTANBUL)
    today = now_local.date()

    if frequency == "daily":
        candidate = _at_istanbul_hour(today, hour)
        if now < candidate:
            return candidate
        return _at_istanbul_hour(today + timedelta(days=1), hour)

    elif frequency == "weekly":
        dow = day_of_week if day_of_week is not None else 0  # 0=Monday
        days_ahead = (dow - today.weekday()) % 7
        candidate = _at_istanbul_hour(today + timedelta(days=days_ahead), hour)
        if candidate <= now:
            candidate = _at_istanbul_hour(today + timedelta(days=days_ahead + 7), hour)
        return candidate

    elif frequency == "monthly":
        dom = day_of_month if day_of_month is not None else 1
        try:
            candidate = _at_istanbul_hour(date(today.year, today.month, dom), hour)
            if candidate > now:
                return candidate
        except ValueError:
            pass
        # Next month
        if today.month == 12:
            next_month_date = date(today.year + 1, 1, 1)
        else:
            next_month_date = date(today.year, today.month + 1, 1)
        try:
            return _at_istanbul_hour(date(next_month_date.year, next_month_date.month, dom), hour)
        except ValueError:
            return _at_istanbul_hour(date(next_month_date.year, next_month_date.month, 1), hour)

    return None


async def generate_and_send_report(db: AsyncSession, schedule) -> int:
    """Generate work log CSV report and send to recipients. Returns count of emails attempted."""
    from app.models.worklog import WorkLog
    from app.models.user import User
    import csv
    import io

    end_date = date.today()
    start_date = end_date - timedelta(days=schedule.date_range_days)

    # Build query
    q = (
        select(WorkLog)
        .options(
            selectinload(WorkLog.work_type),
            selectinload(WorkLog.user),
        )
        .where(
            WorkLog.log_date >= start_date,
            WorkLog.log_date <= end_date,
        )
        .order_by(WorkLog.log_date.desc())
    )

    if schedule.user_id:
        q = q.where(WorkLog.user_id == schedule.user_id)
    elif schedule.team_id:
        # Filter by team members
        team_members = await db.execute(
            select(User.id).where(User.team_id == schedule.team_id)
        )
        member_ids = [r[0] for r in team_members.all()]
        if member_ids:
            q = q.where(WorkLog.user_id.in_(member_ids))

    result = await db.execute(q)
    logs = result.scalars().all()

    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "User", "Work Type", "Duration (h)", "Description"])
    for log in logs:
        writer.writerow([
            log.log_date.isoformat(),
            log.user.full_name if log.user else "",
            log.work_type.name if log.work_type else "",
            float(log.duration_hours),
            log.description,
        ])
    csv_content = output.getvalue()

    # Try to send via SMTP (if configured)
    from app.models.email_config import SmtpConfig
    smtp_result = await db.execute(
        select(SmtpConfig).where(SmtpConfig.is_active == True).limit(1)
    )
    smtp = smtp_result.scalar_one_or_none()

    if not smtp or not schedule.recipient_emails:
        return 0

    sent = 0
    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.base import MIMEBase
        from email import encoders
        from app.core.security import decrypt_field
        from app.config import settings

        password = decrypt_field(smtp.password_encrypted, settings.SMTP_ENCRYPTION_KEY)

        for recipient in schedule.recipient_emails:
            try:
                msg = MIMEMultipart()
                msg['From'] = f"{smtp.from_name} <{smtp.from_email}>"
                msg['To'] = recipient
                msg['Subject'] = f"Work Log Report: {start_date} - {end_date} ({schedule.name})"

                body = f"Attached is the work log report for {start_date} to {end_date}.\n\nTotal entries: {len(logs)}"
                msg.attach(MIMEText(body, 'plain'))

                # Attach CSV
                attachment = MIMEBase('application', 'octet-stream')
                attachment.set_payload(csv_content.encode('utf-8'))
                encoders.encode_base64(attachment)
                filename = f"report_{start_date}_{end_date}.csv"
                attachment.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                msg.attach(attachment)

                import ssl as _ssl
                _ctx = _ssl.create_default_context()
                if getattr(smtp, 'use_ssl', False):
                    server = smtplib.SMTP_SSL(smtp.host, smtp.port, context=_ctx, timeout=15)
                elif smtp.use_tls:
                    server = smtplib.SMTP(smtp.host, smtp.port, timeout=15)
                    server.ehlo()
                    server.starttls(context=_ctx)
                    server.ehlo()
                else:
                    server = smtplib.SMTP(smtp.host, smtp.port, timeout=15)
                    server.ehlo()

                server.login(smtp.username, password)
                server.sendmail(smtp.from_email, recipient, msg.as_string())
                server.quit()
                sent += 1
            except Exception:
                pass
    except Exception:
        pass

    return sent
