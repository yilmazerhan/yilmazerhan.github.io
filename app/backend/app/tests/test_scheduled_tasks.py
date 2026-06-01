"""
Scheduled & recurring task tests:
- compute_next_run (daily, weekly, monthly)
- generate_and_send_report (CSV email via SMTP mock)
- run_due_inventory_schedules (APScheduler callback)
- evaluate_scheduled_workflows (Celery task logic: task_due_soon, task_overdue,
  worklog_reminder, dashboard_report)
- backup_service: create, schedule, prune
- API endpoints: backup, report schedules, inventory schedules
"""
import pytest
from datetime import datetime, timedelta, timezone, date
from unittest.mock import patch, MagicMock, AsyncMock
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.tests.conftest import get_auth_headers


# ─── compute_next_run ─────────────────────────────────────────────────────────

class TestComputeNextRun:
    def test_daily_before_hour_returns_today(self):
        from app.services.report_schedule_service import compute_next_run
        now = datetime.now(timezone.utc)
        # Pick an hour that is still in the future (today)
        future_hour = (now.hour + 1) % 24
        result = compute_next_run("daily", None, None, future_hour)
        assert result is not None
        assert result.tzinfo is not None  # must be timezone-aware
        assert result.hour == future_hour
        assert result.date() == now.date() or result.date() == now.date() + timedelta(days=1)

    def test_daily_after_hour_returns_tomorrow(self):
        from app.services.report_schedule_service import compute_next_run
        now = datetime.now(timezone.utc)
        past_hour = (now.hour - 1) % 24
        result = compute_next_run("daily", None, None, past_hour)
        assert result is not None
        assert result.tzinfo is not None
        # Result must be strictly in the future
        assert result > now

    def test_weekly_returns_future(self):
        from app.services.report_schedule_service import compute_next_run
        result = compute_next_run("weekly", 0, None, 8)  # Monday at 08:00
        assert result is not None
        assert result.tzinfo is not None
        assert result > datetime.now(timezone.utc)
        assert result.weekday() == 0  # Monday

    def test_weekly_all_days(self):
        from app.services.report_schedule_service import compute_next_run
        for dow in range(7):
            result = compute_next_run("weekly", dow, None, 6)
            assert result is not None
            assert result.weekday() == dow
            assert result > datetime.now(timezone.utc)

    def test_monthly_returns_future(self):
        from app.services.report_schedule_service import compute_next_run
        result = compute_next_run("monthly", None, 1, 9)  # 1st of month at 09:00
        assert result is not None
        assert result.tzinfo is not None
        assert result > datetime.now(timezone.utc)
        assert result.day == 1

    def test_monthly_invalid_day_falls_back(self):
        from app.services.report_schedule_service import compute_next_run
        # day 31 doesn't exist in some months — should fall back to day 1
        result = compute_next_run("monthly", None, 31, 8)
        assert result is not None
        assert result > datetime.now(timezone.utc)

    def test_unknown_frequency_returns_none(self):
        from app.services.report_schedule_service import compute_next_run
        result = compute_next_run("invalid", None, None, 8)
        assert result is None


# ─── generate_and_send_report ─────────────────────────────────────────────────

class TestGenerateAndSendReport:
    async def test_returns_zero_when_no_smtp(self, db: AsyncSession):
        from app.services.report_schedule_service import generate_and_send_report
        from app.models.report_schedule import ReportSchedule

        schedule = ReportSchedule(
            name="Test Report",
            frequency="daily",
            hour=8,
            recipient_emails=["test@example.com"],
            date_range_days=7,
        )
        db.add(schedule)
        await db.flush()

        result = await generate_and_send_report(db, schedule)
        assert result == 0  # no SMTP config → 0 sent

    async def test_returns_zero_when_no_recipients(self, db: AsyncSession):
        from app.services.report_schedule_service import generate_and_send_report
        from app.models.report_schedule import ReportSchedule
        from app.models.email_config import SmtpConfig
        from app.core.security import encrypt_field
        from app.config import settings

        smtp = SmtpConfig(
            host="smtp.test.com", port=587, username="u",
            password_encrypted=encrypt_field("pw", settings.SMTP_ENCRYPTION_KEY),
            use_tls=True, from_email="noreply@test.com", from_name="Test",
        )
        db.add(smtp)
        schedule = ReportSchedule(
            name="No Recipients", frequency="daily", hour=8,
            recipient_emails=[],  # empty list
            date_range_days=7,
        )
        db.add(schedule)
        await db.flush()

        result = await generate_and_send_report(db, schedule)
        assert result == 0

    async def test_sends_via_tls_smtp(self, db: AsyncSession):
        from app.services.report_schedule_service import generate_and_send_report
        from app.models.report_schedule import ReportSchedule
        from app.models.email_config import SmtpConfig
        from app.core.security import encrypt_field
        from app.config import settings

        smtp = SmtpConfig(
            host="smtp.test.com", port=587, username="u",
            password_encrypted=encrypt_field("pw", settings.SMTP_ENCRYPTION_KEY),
            use_tls=True, use_ssl=False,
            from_email="noreply@test.com", from_name="Test",
        )
        db.add(smtp)
        schedule = ReportSchedule(
            name="TLS Report", frequency="daily", hour=8,
            recipient_emails=["dest@test.com"],
            date_range_days=7,
        )
        db.add(schedule)
        await db.flush()

        mock_server = MagicMock()
        mock_server.__enter__ = MagicMock(return_value=mock_server)
        mock_server.__exit__ = MagicMock(return_value=False)

        with patch("smtplib.SMTP", return_value=mock_server):
            result = await generate_and_send_report(db, schedule)

        assert result == 1
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once()
        mock_server.sendmail.assert_called_once()

    async def test_sends_via_ssl_smtp(self, db: AsyncSession):
        from app.services.report_schedule_service import generate_and_send_report
        from app.models.report_schedule import ReportSchedule
        from app.models.email_config import SmtpConfig
        from app.core.security import encrypt_field
        from app.config import settings

        smtp = SmtpConfig(
            host="smtp.test.com", port=465, username="u",
            password_encrypted=encrypt_field("pw", settings.SMTP_ENCRYPTION_KEY),
            use_tls=False, use_ssl=True,
            from_email="noreply@test.com", from_name="Test",
        )
        db.add(smtp)
        schedule = ReportSchedule(
            name="SSL Report", frequency="daily", hour=8,
            recipient_emails=["dest@test.com"],
            date_range_days=7,
        )
        db.add(schedule)
        await db.flush()

        mock_server = MagicMock()
        mock_server.__enter__ = MagicMock(return_value=mock_server)
        mock_server.__exit__ = MagicMock(return_value=False)

        with patch("smtplib.SMTP_SSL", return_value=mock_server):
            result = await generate_and_send_report(db, schedule)

        assert result == 1
        mock_server.login.assert_called_once()
        mock_server.sendmail.assert_called_once()

    async def test_sends_via_plain_smtp(self, db: AsyncSession):
        """When use_tls=False and use_ssl=False, must use plain SMTP (not SMTP_SSL)."""
        from app.services.report_schedule_service import generate_and_send_report
        from app.models.report_schedule import ReportSchedule
        from app.models.email_config import SmtpConfig
        from app.core.security import encrypt_field
        from app.config import settings

        smtp = SmtpConfig(
            host="smtp.test.com", port=25, username="u",
            password_encrypted=encrypt_field("pw", settings.SMTP_ENCRYPTION_KEY),
            use_tls=False, use_ssl=False,
            from_email="noreply@test.com", from_name="Test",
        )
        db.add(smtp)
        schedule = ReportSchedule(
            name="Plain Report", frequency="daily", hour=8,
            recipient_emails=["dest@test.com"],
            date_range_days=7,
        )
        db.add(schedule)
        await db.flush()

        mock_server = MagicMock()
        smtp_ssl_mock = MagicMock(side_effect=AssertionError("SMTP_SSL must NOT be called for plain SMTP"))

        with patch("smtplib.SMTP", return_value=mock_server), \
             patch("smtplib.SMTP_SSL", smtp_ssl_mock):
            result = await generate_and_send_report(db, schedule)

        assert result == 1
        mock_server.login.assert_called_once()

    async def test_multiple_recipients_all_sent(self, db: AsyncSession):
        from app.services.report_schedule_service import generate_and_send_report
        from app.models.report_schedule import ReportSchedule
        from app.models.email_config import SmtpConfig
        from app.core.security import encrypt_field
        from app.config import settings

        smtp = SmtpConfig(
            host="smtp.test.com", port=587, username="u",
            password_encrypted=encrypt_field("pw", settings.SMTP_ENCRYPTION_KEY),
            use_tls=True, from_email="noreply@test.com", from_name="Test",
        )
        db.add(smtp)
        schedule = ReportSchedule(
            name="Multi Recipients", frequency="weekly", day_of_week=0, hour=8,
            recipient_emails=["a@test.com", "b@test.com", "c@test.com"],
            date_range_days=30,
        )
        db.add(schedule)
        await db.flush()

        mock_server = MagicMock()
        with patch("smtplib.SMTP", return_value=mock_server):
            result = await generate_and_send_report(db, schedule)

        assert result == 3
        assert mock_server.sendmail.call_count == 3


# ─── run_due_inventory_schedules ──────────────────────────────────────────────

class TestRunDueInventorySchedules:
    async def test_skips_non_due_schedules(self, db: AsyncSession):
        from app.services.inventory_service import run_due_inventory_schedules
        from app.models.inventory import InventoryEmailSchedule

        future = datetime.now(timezone.utc) + timedelta(hours=2)
        sch = InventoryEmailSchedule(
            name="Future Schedule",
            frequency="daily",
            hour=8,
            recipient_emails=["x@test.com"],
            next_run_at=future,
            is_active=True,
        )
        db.add(sch)
        await db.flush()

        with patch("app.services.inventory_service._send_inventory_email", new_callable=AsyncMock) as mock_send:
            await run_due_inventory_schedules(db)
            mock_send.assert_not_called()

    async def test_runs_due_schedules(self, db: AsyncSession):
        from app.services.inventory_service import run_due_inventory_schedules
        from app.models.inventory import InventoryEmailSchedule

        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        sch = InventoryEmailSchedule(
            name="Due Schedule",
            frequency="daily",
            hour=8,
            recipient_emails=["x@test.com"],
            next_run_at=past,
            is_active=True,
        )
        db.add(sch)
        await db.flush()
        sch_id = sch.id

        with patch("app.services.inventory_service._send_inventory_email", new_callable=AsyncMock, return_value=1):
            await run_due_inventory_schedules(db)

        await db.refresh(sch)
        assert sch.last_run_at is not None
        assert sch.next_run_at is not None
        assert sch.next_run_at > datetime.now(timezone.utc)

    async def test_skips_inactive_schedules(self, db: AsyncSession):
        from app.services.inventory_service import run_due_inventory_schedules
        from app.models.inventory import InventoryEmailSchedule

        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        sch = InventoryEmailSchedule(
            name="Inactive Schedule",
            frequency="daily",
            hour=8,
            recipient_emails=["x@test.com"],
            next_run_at=past,
            is_active=False,  # inactive!
        )
        db.add(sch)
        await db.flush()

        with patch("app.services.inventory_service._send_inventory_email", new_callable=AsyncMock) as mock_send:
            await run_due_inventory_schedules(db)
            mock_send.assert_not_called()

    async def test_continues_after_schedule_error(self, db: AsyncSession):
        """An error in one schedule must not block subsequent ones."""
        from app.services.inventory_service import run_due_inventory_schedules
        from app.models.inventory import InventoryEmailSchedule

        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        sch1 = InventoryEmailSchedule(
            name="Fail Schedule", frequency="daily", hour=8,
            recipient_emails=["x@test.com"], next_run_at=past, is_active=True,
        )
        sch2 = InventoryEmailSchedule(
            name="OK Schedule", frequency="daily", hour=8,
            recipient_emails=["y@test.com"], next_run_at=past, is_active=True,
        )
        db.add(sch1)
        db.add(sch2)
        await db.flush()

        call_count = 0

        async def _flaky_send(db, sch):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("Simulated failure")
            return 1

        with patch("app.services.inventory_service._send_inventory_email", side_effect=_flaky_send):
            await run_due_inventory_schedules(db)

        # Both schedules were attempted; second one succeeded
        assert call_count == 2


# ─── Celery task: evaluate_scheduled_workflows ────────────────────────────────

class TestEvaluateWorkflows:
    async def _setup_workflow(self, db, trigger_type: str, template, **kwargs):
        from app.models.email_workflow import EmailWorkflow
        kwargs.setdefault("recipient_type", "specific_emails")
        wf = EmailWorkflow(
            name=f"WF {trigger_type}",
            trigger_type=trigger_type,
            template_id=template.id,
            is_active=True,
            **kwargs,
        )
        db.add(wf)
        await db.flush()
        return wf

    async def _create_template(self, db):
        from app.models.email_template import EmailTemplate
        tmpl = EmailTemplate(
            name="Sched Template",
            slug=f"sched-tmpl-{id(db)}",
            subject="Subject: {{ var }}",
            html_body="<p>{{ var }}</p>",
        )
        db.add(tmpl)
        await db.flush()
        return tmpl

    async def _create_board_and_column(self, db, terminal: bool = False):
        from app.models.kanban import KanbanBoard, KanbanColumn
        board = KanbanBoard(name=f"Board-{id(db)}")
        db.add(board)
        await db.flush()
        col = KanbanColumn(
            name="Col", board_id=board.id, color="#000", sort_order=1,
            is_terminal=terminal,
        )
        db.add(col)
        await db.flush()
        return col

    async def test_task_due_soon_sends_email(self, db: AsyncSession):
        from app.tasks.email_tasks import _handle_task_due_soon
        from app.models.kanban import Task
        from app.models.user import User
        from app.core.security import hash_password

        tmpl = await self._create_template(db)
        col = await self._create_board_and_column(db)

        assignee = User(
            email="assignee_sched@test.com", username="assignee_sched",
            hashed_password=hash_password("pass"), full_name="Assignee",
            role="user", is_active=True,
        )
        db.add(assignee)
        await db.flush()

        target_date = date.today() + timedelta(days=3)
        task = Task(
            title="Due Soon Task",
            column_id=col.id,
            assignee_id=assignee.id,
            created_by=assignee.id,
            due_date=target_date,
            sort_order=1,
        )
        db.add(task)
        await db.flush()

        wf = await self._setup_workflow(db, "task_due_soon", tmpl,
                                        trigger_config={"days_before": 3})

        with patch("app.tasks.email_tasks.send_email_task") as mock_task:
            mock_task.delay = MagicMock()
            await _handle_task_due_soon(db, wf, target_date)

        mock_task.delay.assert_called_once()
        call_kwargs = mock_task.delay.call_args.kwargs
        assert call_kwargs["to_email"] == assignee.email

    async def test_task_due_soon_skips_no_assignee(self, db: AsyncSession):
        from app.tasks.email_tasks import _handle_task_due_soon
        from app.models.kanban import Task
        from app.models.user import User
        from app.core.security import hash_password

        tmpl = await self._create_template(db)
        col = await self._create_board_and_column(db)

        creator = User(
            email="creator_noassign@test.com", username="creator_noassign",
            hashed_password=hash_password("pass"), full_name="Creator",
            role="user", is_active=True,
        )
        db.add(creator)
        await db.flush()

        target_date = date.today() + timedelta(days=2)
        task = Task(
            title="Unassigned Due Task",
            column_id=col.id,
            assignee_id=None,  # no assignee!
            created_by=creator.id,
            due_date=target_date,
            sort_order=1,
        )
        db.add(task)
        await db.flush()

        wf = await self._setup_workflow(db, "task_due_soon", tmpl,
                                        trigger_config={"days_before": 2})

        with patch("app.tasks.email_tasks.send_email_task") as mock_task:
            mock_task.delay = MagicMock()
            await _handle_task_due_soon(db, wf, target_date)

        mock_task.delay.assert_not_called()

    async def test_task_overdue_sends_email(self, db: AsyncSession):
        from app.tasks.email_tasks import _handle_task_overdue
        from app.models.kanban import Task
        from app.models.user import User
        from app.core.security import hash_password

        tmpl = await self._create_template(db)
        col = await self._create_board_and_column(db, terminal=False)

        assignee = User(
            email="overdue_assignee@test.com", username="overdue_assignee",
            hashed_password=hash_password("pass"), full_name="Overdue Assignee",
            role="user", is_active=True,
        )
        db.add(assignee)
        await db.flush()

        past_date = date.today() - timedelta(days=2)
        task = Task(
            title="Overdue Task",
            column_id=col.id,
            assignee_id=assignee.id,
            created_by=assignee.id,
            due_date=past_date,
            sort_order=1,
        )
        db.add(task)
        await db.flush()

        wf = await self._setup_workflow(db, "task_overdue", tmpl)

        with patch("app.tasks.email_tasks.send_email_task") as mock_task:
            mock_task.delay = MagicMock()
            await _handle_task_overdue(db, wf, date.today())

        mock_task.delay.assert_called_once()

    async def test_task_overdue_skips_terminal_column(self, db: AsyncSession):
        from app.tasks.email_tasks import _handle_task_overdue
        from app.models.kanban import Task
        from app.models.user import User
        from app.core.security import hash_password

        tmpl = await self._create_template(db)
        col = await self._create_board_and_column(db, terminal=True)  # DONE column

        assignee = User(
            email="terminal_assignee@test.com", username="terminal_assignee",
            hashed_password=hash_password("pass"), full_name="Terminal Assignee",
            role="user", is_active=True,
        )
        db.add(assignee)
        await db.flush()

        past_date = date.today() - timedelta(days=1)
        task = Task(
            title="Done Task",
            column_id=col.id,
            assignee_id=assignee.id,
            created_by=assignee.id,
            due_date=past_date,
            sort_order=1,
        )
        db.add(task)
        await db.flush()

        wf = await self._setup_workflow(db, "task_overdue", tmpl)

        with patch("app.tasks.email_tasks.send_email_task") as mock_task:
            mock_task.delay = MagicMock()
            await _handle_task_overdue(db, wf, date.today())

        mock_task.delay.assert_not_called()

    async def test_worklog_reminder_skips_users_who_logged(self, db: AsyncSession):
        from app.tasks.email_tasks import _handle_worklog_reminder
        from app.models.user import User
        from app.models.worklog import WorkLog, WorkType
        from app.core.security import hash_password

        tmpl = await self._create_template(db)

        user_logged = User(
            email="logged_today@test.com", username="logged_today",
            hashed_password=hash_password("pass"), full_name="Logged User",
            role="user", is_active=True,
        )
        db.add(user_logged)
        await db.flush()

        wt = WorkType(name=f"WType-{id(db)}", created_by=user_logged.id)
        db.add(wt)
        await db.flush()

        log = WorkLog(
            user_id=user_logged.id,
            work_type_id=wt.id,
            log_date=date.today(),
            duration_hours=2.0,
            description="Done",
        )
        db.add(log)
        await db.flush()

        wf = await self._setup_workflow(db, "worklog_reminder", tmpl)

        with patch("app.tasks.email_tasks.send_email_task") as mock_task:
            mock_task.delay = MagicMock()
            await _handle_worklog_reminder(db, wf, date.today())

        # user_logged should NOT receive reminder (already logged)
        for call in mock_task.delay.call_args_list:
            assert call.kwargs.get("to_email") != user_logged.email

    async def test_dashboard_report_sends_to_specific_emails(self, db: AsyncSession):
        from app.tasks.email_tasks import _handle_dashboard_report
        from app.models.email_template import EmailTemplate

        tmpl = EmailTemplate(
            name="Dashboard Report Template",
            slug="dashboard_report",
            subject="Dashboard {{ report_date }}",
            html_body="<p>Tasks: {{ total_tasks }}</p>",
        )
        db.add(tmpl)
        await db.flush()

        wf = await self._setup_workflow(
            db, "dashboard_report", tmpl,
            recipient_type="specific_emails",
            recipient_users=["exec@test.com", "mgr@test.com"],
        )

        with patch("app.tasks.email_tasks.send_email_task") as mock_task:
            mock_task.delay = MagicMock()
            await _handle_dashboard_report(db, wf, date.today())

        assert mock_task.delay.call_count == 2
        sent_to = {c.kwargs["to_email"] for c in mock_task.delay.call_args_list}
        assert "exec@test.com" in sent_to
        assert "mgr@test.com" in sent_to

    async def test_dashboard_report_deduplication(self, db: AsyncSession):
        """Dashboard report sent twice in same day must only send once."""
        from app.tasks.email_tasks import _handle_dashboard_report
        from app.models.email_template import EmailTemplate
        from app.models.email_log import EmailLog

        tmpl = EmailTemplate(
            name="Dedup Report Template",
            slug="dedup_report_slug",
            subject="Dash",
            html_body="<p>body</p>",
        )
        db.add(tmpl)
        await db.flush()

        wf = await self._setup_workflow(
            db, "dashboard_report", tmpl,
            recipient_type="specific_emails",
            recipient_users=["dedup@test.com"],
        )

        # Simulate a log entry for today (already sent)
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        existing_log = EmailLog(
            workflow_id=wf.id,
            to_email="dedup@test.com",
            subject="Already Sent",
            status="sent",
        )
        db.add(existing_log)
        await db.flush()

        # Force created_at to today by refreshing after insert
        # (it uses server_default=now())

        with patch("app.tasks.email_tasks.send_email_task") as mock_task:
            mock_task.delay = MagicMock()
            await _handle_dashboard_report(db, wf, date.today())

        # Should not send again because already_sent check uses EmailLog.created_at >= today_start
        mock_task.delay.assert_not_called()


# ─── Backup service ───────────────────────────────────────────────────────────

class TestBackupService:
    async def test_create_backup_mocked_pg_dump(self, db: AsyncSession):
        from app.services import backup_service

        fake_sql = b"-- pg_dump output\nSELECT 1;"

        async def _fake_run(cmd, env, stdin=None):
            return fake_sql, b"", 0

        with patch("app.services.backup_service._run", _fake_run), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(return_value=MagicMock(__enter__=MagicMock(return_value=MagicMock()), __exit__=MagicMock(return_value=False)))):
            record = await backup_service.create_backup(db, backup_type="manual", notes="test")

        assert record.backup_type == "manual"
        assert record.file_size == len(fake_sql)
        assert record.status == "completed"

    async def test_create_backup_pg_dump_failure_raises(self, db: AsyncSession):
        from app.services import backup_service
        from fastapi import HTTPException

        async def _fail_run(cmd, env, stdin=None):
            return b"", b"connection refused", 1

        with patch("app.services.backup_service._run", _fail_run), \
             patch("app.services.backup_service._ensure_backup_dir"):
            with pytest.raises(HTTPException) as exc_info:
                await backup_service.create_backup(db)

        assert exc_info.value.status_code == 500

    async def test_get_and_save_schedule(self, db: AsyncSession):
        from app.services import backup_service

        sched = await backup_service.get_schedule(db)
        assert "backup_enabled" in sched
        assert sched["backup_enabled"] == "false"

        # Save new settings
        updated = await backup_service.save_schedule(db, {
            "backup_enabled": "true",
            "backup_frequency": "weekly",
            "backup_hour": "3",
            "backup_day_of_week": "5",  # Saturday
        })
        assert updated["backup_enabled"] == "true"
        assert updated["backup_frequency"] == "weekly"
        assert updated["backup_hour"] == "3"
        assert updated["backup_day_of_week"] == "5"

    async def test_save_schedule_ignores_unknown_keys(self, db: AsyncSession):
        from app.services import backup_service

        updated = await backup_service.save_schedule(db, {
            "backup_enabled": "true",
            "malicious_key": "HACKED",  # must be ignored
        })
        assert "malicious_key" not in updated

    async def test_delete_backup_removes_record(self, db: AsyncSession):
        from app.services import backup_service
        from app.models.backup_record import BackupRecord

        record = BackupRecord(
            filename="backup_test_abc12345.sql",
            display_name="Test Backup",
            file_size=1024,
            backup_type="manual",
            status="completed",
        )
        db.add(record)
        await db.flush()
        record_id = record.id

        with patch("os.path.exists", return_value=False):
            await backup_service.delete_backup(db, record_id)

        from sqlalchemy import select
        result = await db.execute(select(BackupRecord).where(BackupRecord.id == record_id))
        assert result.scalar_one_or_none() is None

    async def test_delete_nonexistent_backup_raises_404(self, db: AsyncSession):
        from app.services import backup_service
        from fastapi import HTTPException
        import uuid

        with pytest.raises(HTTPException) as exc_info:
            await backup_service.delete_backup(db, uuid.uuid4())

        assert exc_info.value.status_code == 404

    async def test_prune_keeps_retention_count(self, db: AsyncSession):
        """After creating N+5 backups, prune should keep only N."""
        from app.services import backup_service
        from app.models.backup_record import BackupRecord
        from app.models.app_setting import AppSetting

        # Set retention to 3
        db.add(AppSetting(key="backup_retention_count", value="3"))
        await db.flush()

        # Add 5 backup records
        for i in range(5):
            db.add(BackupRecord(
                filename=f"backup_prune_{i}_abc12345.sql",
                display_name=f"Backup {i}",
                file_size=100,
                backup_type="scheduled",
                status="completed",
            ))
        await db.flush()

        with patch("os.path.exists", return_value=False):
            await backup_service._prune_old_backups(db)

        from sqlalchemy import select, func
        count = (await db.execute(select(func.count(BackupRecord.id)))).scalar_one()
        assert count <= 3


# ─── Backup API endpoints ─────────────────────────────────────────────────────

class TestBackupAPI:
    async def test_list_backups_superadmin(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/backup/records", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_backups_regular_user_forbidden(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/backup/records", headers=headers)
        assert resp.status_code == 403

    async def test_get_schedule(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/backup/schedule", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "backup_enabled" in data
        assert "backup_frequency" in data

    async def test_save_schedule(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.put("/api/v1/backup/schedule", headers=headers, json={
            "backup_enabled": "true",
            "backup_frequency": "daily",
            "backup_hour": "4",
        })
        assert resp.status_code == 200
        assert resp.json()["backup_enabled"] == "true"

    async def test_create_backup_requires_superadmin(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.post("/api/v1/backup/create", headers=headers)
        assert resp.status_code == 403

    async def test_create_backup_pg_dump_not_found(self, client: AsyncClient, superadmin_user: User):
        """In test env, pg_dump might not exist → 501; or might work → 200."""
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        with patch("app.services.backup_service._ensure_backup_dir"):
            resp = await client.post("/api/v1/backup/create", headers=headers)
        # Either succeeds (pg_dump available) or returns 501/500
        assert resp.status_code in (200, 500, 501)


# ─── Report schedule API ──────────────────────────────────────────────────────

class TestReportScheduleAPI:
    async def test_create_report_schedule(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/admin/reports/schedules", headers=headers, json={
            "name": "Daily Worklog Report",
            "frequency": "daily",
            "hour": 8,
            "recipient_emails": ["report@test.com"],
            "date_range_days": 7,
            "is_active": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Daily Worklog Report"
        assert data["next_run_at"] is not None

    async def test_list_report_schedules(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.models.report_schedule import ReportSchedule
        db.add(ReportSchedule(
            name="List Test Schedule", frequency="weekly", day_of_week=0, hour=9,
            recipient_emails=["x@test.com"], date_range_days=7,
        ))
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/admin/reports/schedules", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_report_schedule_requires_superadmin(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/admin/reports/schedules", headers=headers)
        assert resp.status_code == 403

    async def test_run_report_schedule_no_smtp(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.models.report_schedule import ReportSchedule
        schedule = ReportSchedule(
            name="Run Test Schedule", frequency="daily", hour=8,
            recipient_emails=["run@test.com"], date_range_days=7,
        )
        db.add(schedule)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post(f"/api/v1/admin/reports/schedules/{schedule.id}/run", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "sent" in data
        assert data["sent"] == 0  # no SMTP → 0 sent

    async def test_delete_report_schedule(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.models.report_schedule import ReportSchedule
        schedule = ReportSchedule(
            name="Delete Me", frequency="monthly", day_of_month=1, hour=6,
            recipient_emails=["del@test.com"], date_range_days=30,
        )
        db.add(schedule)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.delete(f"/api/v1/admin/reports/schedules/{schedule.id}", headers=headers)
        assert resp.status_code == 204


# ─── Inventory schedule API ───────────────────────────────────────────────────

class TestInventoryScheduleAPI:
    async def test_create_inventory_schedule(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post("/api/v1/inventory/schedules", headers=headers, json={
            "name": "Weekly Inventory",
            "frequency": "weekly",
            "day_of_week": 1,  # Tuesday
            "hour": 7,
            "recipient_emails": ["inv@test.com"],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Weekly Inventory"
        assert data["next_run_at"] is not None

    async def test_list_inventory_schedules(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.models.inventory import InventoryEmailSchedule
        db.add(InventoryEmailSchedule(
            name="List Inv Schedule", frequency="daily", hour=8,
            recipient_emails=["x@test.com"],
        ))
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/inventory/schedules", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_delete_inventory_schedule(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.models.inventory import InventoryEmailSchedule
        sch = InventoryEmailSchedule(
            name="Del Inv Schedule", frequency="daily", hour=8,
            recipient_emails=["y@test.com"],
        )
        db.add(sch)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.delete(f"/api/v1/inventory/schedules/{sch.id}", headers=headers)
        assert resp.status_code == 200

    async def test_send_now_no_smtp_returns_zero(self, client: AsyncClient, superadmin_user: User, db: AsyncSession):
        from app.models.inventory import InventoryEmailSchedule
        sch = InventoryEmailSchedule(
            name="Send Now Test", frequency="daily", hour=8,
            recipient_emails=["now@test.com"],
        )
        db.add(sch)
        await db.flush()

        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.post(f"/api/v1/inventory/schedules/{sch.id}/send-now", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["sent"] == 0  # no SMTP → 0

    async def test_inventory_schedule_access_denied_for_user(self, client: AsyncClient, regular_user: User):
        """Regular users can VIEW inventory (role default) but cannot CREATE schedules."""
        headers = await get_auth_headers(client, regular_user.email, "User123!")

        # VIEW: allowed for regular users (default permission)
        resp_get = await client.get("/api/v1/inventory/schedules", headers=headers)
        assert resp_get.status_code == 200

        # CREATE: denied (regular users only have 'view' on inventory)
        resp_post = await client.post("/api/v1/inventory/schedules", headers=headers, json={
            "name": "Unauthorized",
            "frequency": "daily",
            "hour": 8,
            "recipient_emails": ["x@test.com"],
        })
        assert resp_post.status_code == 403


# ─── APScheduler callback integration: inventory commit ───────────────────────

class TestInventoryScheduleIntegration:
    """
    Regression tests for the missing commit bug in main.py._run_inventory_email_check.

    Old buggy code:
        async with AsyncSessionLocal() as db:      # plain session — no auto-commit
            await run_due_inventory_schedules(db)  # only flush() → rolled back on close

    Fixed code:
        async with AsyncSessionLocal.begin() as db:  # auto-commits on success

    These tests simulate the APScheduler callback by opening a begin()-session
    against the TEST DB (to avoid touching production) and verify that
    last_run_at / next_run_at are committed and visible to other sessions.
    """

    async def _call_via_fresh_session(self) -> None:
        """Mirrors main.py._run_inventory_email_check against the test DB."""
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from app.tests.conftest import TEST_DATABASE_URL
        from app.services.inventory_service import run_due_inventory_schedules
        engine = create_async_engine(TEST_DATABASE_URL, echo=False)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session.begin() as db:
                await run_due_inventory_schedules(db)
        finally:
            await engine.dispose()

    async def test_last_run_at_committed_after_scheduler_callback(self, db: AsyncSession):
        """
        Bug regression: last_run_at and next_run_at must be committed to the DB
        after the APScheduler callback, not just flushed inside a rolled-back session.

        Verification note: we use db.refresh(sch) rather than a SELECT query because
        SQLAlchemy's identity map may return a cached object (stale values) if the
        session committed the same record earlier and expire_on_commit=False is set.
        db.refresh() always forces a re-read from the DB.
        """
        from app.models.inventory import InventoryEmailSchedule
        from sqlalchemy import delete as sa_delete

        await db.execute(sa_delete(InventoryEmailSchedule))
        await db.commit()

        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        sch = InventoryEmailSchedule(
            name="Commit Test Schedule",
            frequency="daily",
            hour=8,
            recipient_emails=["commit@test.com"],
            next_run_at=past,
            is_active=True,
        )
        db.add(sch)
        await db.commit()

        with patch("app.services.inventory_service._send_inventory_email",
                   new_callable=AsyncMock, return_value=1):
            await self._call_via_fresh_session()

        # db.refresh() forces a round-trip to the DB, bypassing the identity-map
        # cache so we read what the fresh session actually committed.
        await db.refresh(sch)

        assert sch.last_run_at is not None, (
            "last_run_at was not committed — old bug: _run_inventory_email_check "
            "used AsyncSessionLocal() without .begin(), so run_due_inventory_schedules "
            "flush() was rolled back on session close."
        )
        assert sch.next_run_at is not None
        assert sch.next_run_at > past, (
            "next_run_at must have been updated beyond the original past value."
        )

    async def test_schedule_not_retriggered_after_commit(self, db: AsyncSession):
        """
        After the first APScheduler callback updates next_run_at to a future time
        (and commits it), a second callback must skip the schedule.
        Without the commit fix, next_run_at reverts to the old past value on every
        run and the schedule fires repeatedly on every hour.
        """
        from app.models.inventory import InventoryEmailSchedule
        from sqlalchemy import delete as sa_delete

        await db.execute(sa_delete(InventoryEmailSchedule))
        await db.commit()

        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.add(InventoryEmailSchedule(
            name="Retrigger Test",
            frequency="daily",
            hour=8,
            recipient_emails=["retrigger@test.com"],
            next_run_at=past,
            is_active=True,
        ))
        await db.commit()

        send_count = 0

        async def _count_sends(db_arg, sch):
            nonlocal send_count
            send_count += 1
            return 1

        with patch("app.services.inventory_service._send_inventory_email",
                   side_effect=_count_sends):
            await self._call_via_fresh_session()  # first call — processes schedule
            await self._call_via_fresh_session()  # second call — must skip (next_run_at in future)

        assert send_count == 1, (
            f"Schedule triggered {send_count} times but must trigger only once. "
            "Without the commit fix, next_run_at update is rolled back and the "
            "schedule appears perpetually due to be re-run."
        )

    async def test_inactive_schedule_never_processed(self, db: AsyncSession):
        """An inactive schedule must not be processed by the APScheduler callback."""
        from app.models.inventory import InventoryEmailSchedule
        from sqlalchemy import delete as sa_delete

        await db.execute(sa_delete(InventoryEmailSchedule))
        await db.commit()

        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.add(InventoryEmailSchedule(
            name="Inactive Integration",
            frequency="daily",
            hour=8,
            recipient_emails=["inactive@test.com"],
            next_run_at=past,
            is_active=False,
        ))
        await db.commit()

        with patch("app.services.inventory_service._send_inventory_email",
                   new_callable=AsyncMock) as mock_send:
            await self._call_via_fresh_session()

        mock_send.assert_not_called()
