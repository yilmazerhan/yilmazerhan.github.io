import io
import uuid
from datetime import datetime, timezone
from typing import Optional

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from sqlalchemy import select, or_, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, InventoryEmailSchedule
from app.core.security import encrypt_field, decrypt_field
from app.core.exceptions import NotFoundError, ValidationError, ForbiddenError
from app.config import settings
from app.services.report_schedule_service import compute_next_run


# Mapping: plaintext field name → (encrypted column name, settings key attr)
_ENCRYPTED_FIELDS = {
    "password": "password_encrypted",
    "ssh_key": "ssh_key_encrypted",
    "access_key_id": "access_key_id_encrypted",
    "secret_access_key": "secret_access_key_encrypted",
}

EXPORT_HEADERS = [
    "ID", "Type", "Display Name", "Description", "Hostname", "IP Address",
    "Port", "Username", "Has Password", "Has SSH Key", "Operating System",
    "Database Name", "Database Type",
    "Email Address", "SMTP Host", "SMTP Port", "IMAP Host", "IMAP Port",
    "Provider", "Account ID", "Has Access Key", "Region",
    "URL", "Tags", "Notes", "Is Active", "Created At",
]


class InventoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Item CRUD ────────────────────────────────────────────────────────────

    async def list_items(
        self,
        *,
        item_type: Optional[str] = None,
        search: Optional[str] = None,
        tags: Optional[list[str]] = None,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 200,
    ) -> list[InventoryItem]:
        q = select(InventoryItem)

        if item_type:
            q = q.where(InventoryItem.item_type == item_type)
        if search:
            term = f"%{search}%"
            q = q.where(
                or_(
                    InventoryItem.display_name.ilike(term),
                    InventoryItem.hostname.ilike(term),
                    InventoryItem.ip_address.ilike(term),
                    InventoryItem.email_address.ilike(term),
                    InventoryItem.description.ilike(term),
                )
            )
        if tags:
            # JSONB @> operator: item must contain all supplied tags
            for tag in tags:
                q = q.where(InventoryItem.tags.contains([tag]))
        if is_active is not None:
            q = q.where(InventoryItem.is_active == is_active)

        q = q.order_by(InventoryItem.display_name).offset(skip).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def get_item(self, item_id: uuid.UUID) -> InventoryItem:
        result = await self.db.execute(
            select(InventoryItem).where(InventoryItem.id == item_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise NotFoundError("Envanter öğesi")
        return item

    async def create_item(
        self, data: dict, created_by: uuid.UUID
    ) -> InventoryItem:
        """Create an inventory item, encrypting sensitive fields."""
        kwargs = {k: v for k, v in data.items() if k not in _ENCRYPTED_FIELDS and v is not None}
        kwargs["created_by"] = created_by
        kwargs["updated_by"] = created_by

        item = InventoryItem(**kwargs)

        key = settings.INVENTORY_ENCRYPTION_KEY
        for plain_field, enc_col in _ENCRYPTED_FIELDS.items():
            plaintext = data.get(plain_field)
            if plaintext:
                if not key:
                    raise ValidationError("INVENTORY_ENCRYPTION_KEY yapılandırılmamış.")
                setattr(item, enc_col, encrypt_field(plaintext, key))

        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def update_item(
        self, item_id: uuid.UUID, data: dict, updated_by: uuid.UUID
    ) -> InventoryItem:
        item = await self.get_item(item_id)

        key = settings.INVENTORY_ENCRYPTION_KEY
        for field, value in data.items():
            if value is None:
                continue
            if field in _ENCRYPTED_FIELDS:
                # Re-encrypt only if a new value is explicitly supplied
                if not key:
                    raise ValidationError("INVENTORY_ENCRYPTION_KEY yapılandırılmamış.")
                setattr(item, _ENCRYPTED_FIELDS[field], encrypt_field(value, key))
            else:
                setattr(item, field, value)

        item.updated_by = updated_by
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def delete_item(self, item_id: uuid.UUID) -> None:
        item = await self.get_item(item_id)
        await self.db.delete(item)
        await self.db.flush()

    async def reveal_field(self, item_id: uuid.UUID, field_name: str) -> str:
        """Decrypt and return a single sensitive field value."""
        if field_name not in _ENCRYPTED_FIELDS:
            raise ValidationError(f"Geçersiz alan: {field_name}")

        item = await self.get_item(item_id)
        enc_col = _ENCRYPTED_FIELDS[field_name]
        encrypted = getattr(item, enc_col)
        if not encrypted:
            raise ValidationError("Bu alan için kayıtlı veri bulunamadı.")

        key = settings.INVENTORY_ENCRYPTION_KEY
        if not key:
            raise ValidationError("INVENTORY_ENCRYPTION_KEY yapılandırılmamış.")
        return decrypt_field(encrypted, key)

    # ─── Export ───────────────────────────────────────────────────────────────

    async def export_excel(self, item_type: Optional[str] = None) -> bytes:
        """Generate an Excel file with all (non-secret) inventory items."""
        items = await self.list_items(item_type=item_type, limit=10000)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Inventory"

        # Header style
        header_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)

        for col_idx, header in enumerate(EXPORT_HEADERS, start=1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")

        for row_idx, item in enumerate(items, start=2):
            row = _item_to_row(item)
            for col_idx, value in enumerate(row, start=1):
                ws.cell(row=row_idx, column=col_idx, value=value)

        # Auto-fit columns (approximate)
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 50)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf.read()

    async def export_csv(self, item_type: Optional[str] = None) -> str:
        """Generate CSV content with all (non-secret) inventory items."""
        import csv as _csv
        items = await self.list_items(item_type=item_type, limit=10000)

        output = io.StringIO()
        writer = _csv.writer(output)
        writer.writerow(EXPORT_HEADERS)
        for item in items:
            writer.writerow(_item_to_row(item))
        return output.getvalue()

    # ─── Email Schedules ─────────────────────────────────────────────────────

    async def list_schedules(self) -> list[InventoryEmailSchedule]:
        result = await self.db.execute(
            select(InventoryEmailSchedule).order_by(InventoryEmailSchedule.created_at)
        )
        return list(result.scalars().all())

    async def get_schedule(self, schedule_id: uuid.UUID) -> InventoryEmailSchedule:
        result = await self.db.execute(
            select(InventoryEmailSchedule).where(InventoryEmailSchedule.id == schedule_id)
        )
        sch = result.scalar_one_or_none()
        if not sch:
            raise NotFoundError("Zamanlama")
        return sch

    async def create_schedule(
        self, data: dict, created_by: uuid.UUID
    ) -> InventoryEmailSchedule:
        sch = InventoryEmailSchedule(
            **data,
            created_by=created_by,
            next_run_at=compute_next_run(
                data["frequency"],
                data.get("day_of_week"),
                data.get("day_of_month"),
                data.get("hour", 8),
            ),
        )
        self.db.add(sch)
        await self.db.flush()
        await self.db.refresh(sch)
        return sch

    async def update_schedule(
        self, schedule_id: uuid.UUID, data: dict
    ) -> InventoryEmailSchedule:
        sch = await self.get_schedule(schedule_id)
        for field, value in data.items():
            if value is not None:
                setattr(sch, field, value)
        # Recompute next run
        sch.next_run_at = compute_next_run(
            sch.frequency, sch.day_of_week, sch.day_of_month, sch.hour
        )
        await self.db.flush()
        await self.db.refresh(sch)
        return sch

    async def delete_schedule(self, schedule_id: uuid.UUID) -> None:
        sch = await self.get_schedule(schedule_id)
        await self.db.delete(sch)
        await self.db.flush()

    async def send_now(self, schedule_id: uuid.UUID) -> int:
        """Manually trigger an inventory email schedule."""
        sch = await self.get_schedule(schedule_id)
        sent = await _send_inventory_email(self.db, sch)
        sch.last_run_at = datetime.now(timezone.utc)
        sch.next_run_at = compute_next_run(
            sch.frequency, sch.day_of_week, sch.day_of_month, sch.hour
        )
        await self.db.flush()
        return sent


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _item_to_row(item: InventoryItem) -> list:
    return [
        str(item.id),
        item.item_type,
        item.display_name,
        item.description or "",
        item.hostname or "",
        item.ip_address or "",
        item.port or "",
        item.username or "",
        "yes" if item.password_encrypted else "no",
        "yes" if item.ssh_key_encrypted else "no",
        item.operating_system or "",
        item.database_name or "",
        item.database_type or "",
        item.email_address or "",
        item.smtp_host or "",
        item.smtp_port or "",
        item.imap_host or "",
        item.imap_port or "",
        item.provider or "",
        item.account_id or "",
        "yes" if item.access_key_id_encrypted else "no",
        item.region or "",
        item.url or "",
        ", ".join(item.tags) if item.tags else "",
        item.notes or "",
        "yes" if item.is_active else "no",
        item.created_at.isoformat() if item.created_at else "",
    ]


async def _send_inventory_email(db: AsyncSession, schedule: InventoryEmailSchedule) -> int:
    """Generate Excel and send to all schedule recipients. Returns count of sent emails."""
    from app.models.email_config import SmtpConfig

    smtp_result = await db.execute(
        select(SmtpConfig).where(SmtpConfig.is_active == True).limit(1)
    )
    smtp = smtp_result.scalar_one_or_none()

    if not smtp or not schedule.recipient_emails:
        return 0

    # Generate inventory Excel
    svc = InventoryService(db)
    excel_bytes = await svc.export_excel()

    sent = 0
    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.base import MIMEBase
        from email import encoders
        from app.core.security import decrypt_field as _dec
        from app.config import settings as _s

        smtp_password = _dec(smtp.password_encrypted, _s.SMTP_ENCRYPTION_KEY)

        for recipient in schedule.recipient_emails:
            try:
                msg = MIMEMultipart()
                msg["From"] = f"{smtp.from_name} <{smtp.from_email}>"
                msg["To"] = recipient
                msg["Subject"] = f"Envanter Raporu — {schedule.name}"

                body = "Ekte envanter raporu yer almaktadır.\n"
                msg.attach(MIMEText(body, "plain", "utf-8"))

                part = MIMEBase("application", "octet-stream")
                part.set_payload(excel_bytes)
                encoders.encode_base64(part)
                today_str = datetime.utcnow().strftime("%Y%m%d")
                part.add_header(
                    "Content-Disposition",
                    f'attachment; filename="inventory_{today_str}.xlsx"',
                )
                msg.attach(part)

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

                server.login(smtp.username, smtp_password)
                server.sendmail(smtp.from_email, recipient, msg.as_string())
                server.quit()
                sent += 1
            except Exception:
                pass
    except Exception:
        pass

    return sent


async def run_due_inventory_schedules(db: AsyncSession) -> None:
    """Called by APScheduler hourly — sends emails for due schedules."""
    from datetime import timezone as _tz
    now = datetime.now(_tz.utc)
    result = await db.execute(
        select(InventoryEmailSchedule).where(
            InventoryEmailSchedule.is_active == True,
            InventoryEmailSchedule.next_run_at <= now,
        )
    )
    schedules = list(result.scalars().all())

    for sch in schedules:
        try:
            await _send_inventory_email(db, sch)
            sch.last_run_at = now
            sch.next_run_at = compute_next_run(
                sch.frequency, sch.day_of_week, sch.day_of_month, sch.hour
            )
        except Exception:
            pass

    if schedules:
        await db.flush()
