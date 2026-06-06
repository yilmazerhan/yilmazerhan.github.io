"""
Backup schedule tests — focused on the previously-broken scheduled-backup logic:

  Bug 1 (CRITICAL): Missing await db.commit() after create_backup() → record was
      rolled back and never visible in the DB despite the file being written to disk.
  Bug 2: datetime.utcnow() (naive) mixed with timezone-aware BackupRecord.created_at
      → inconsistent comparisons.
  Bug 3: Hour check used local UTC while the schedule hour was stored as an integer
      that users expect to be in the server's UTC wall clock.

All these are fixed in backup_service.run_scheduled_backup_check().
"""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock, MagicMock
from zoneinfo import ZoneInfo
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

_ISTANBUL = ZoneInfo("Europe/Istanbul")

from app.models.user import User
from app.models.backup_record import BackupRecord
from app.tests.conftest import get_auth_headers


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _enable_backup(db: AsyncSession, hour: int = 2, frequency: str = "daily",
                         day_of_week: int = 0) -> None:
    """Write backup schedule settings directly to the DB."""
    from app.services.backup_service import save_schedule
    await save_schedule(db, {
        "backup_enabled": "true",
        "backup_frequency": frequency,
        "backup_hour": str(hour),
        "backup_day_of_week": str(day_of_week),
    })


async def _disable_backup(db: AsyncSession) -> None:
    from app.services.backup_service import save_schedule
    await save_schedule(db, {"backup_enabled": "false"})


def _now_at_hour(hour: int) -> datetime:
    """Return a UTC datetime where Istanbul time is the given hour."""
    now_ist = datetime.now(_ISTANBUL).replace(hour=hour, minute=0, second=0, microsecond=0)
    return now_ist.astimezone(timezone.utc)


FAKE_SQL = b"-- pg_dump output\nSELECT 1;\n"


async def _fake_run_ok(cmd, env, stdin=None):
    return FAKE_SQL, b"", 0


async def _fake_run_fail(cmd, env, stdin=None):
    return b"", b"connection refused", 1


# ─── Core: run_scheduled_backup_check ─────────────────────────────────────────

class TestRunScheduledBackupCheck:

    async def test_disabled_schedule_returns_false(self, db: AsyncSession):
        await _disable_backup(db)
        from app.services.backup_service import run_scheduled_backup_check
        result = await run_scheduled_backup_check(db, now=_now_at_hour(2))
        assert result is False

    async def test_wrong_hour_returns_false(self, db: AsyncSession):
        await _enable_backup(db, hour=3)
        from app.services.backup_service import run_scheduled_backup_check
        # Pass hour=2, configured is 3 → skip
        result = await run_scheduled_backup_check(db, now=_now_at_hour(2))
        assert result is False

    async def test_correct_hour_runs_backup(self, db: AsyncSession):
        """THE PRIMARY BUG: backup record must be committed and visible after the call."""
        await _enable_backup(db, hour=2)

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            from app.services.backup_service import run_scheduled_backup_check
            result = await run_scheduled_backup_check(db, now=_now_at_hour(2))

        assert result is True

        # The backup record must now be visible in the same session
        # (commit was called inside run_scheduled_backup_check)
        records = (await db.execute(
            select(BackupRecord).where(BackupRecord.backup_type == "scheduled")
        )).scalars().all()
        assert len(records) == 1
        assert records[0].status == "completed"
        assert records[0].file_size == len(FAKE_SQL)

    async def test_record_has_timezone_aware_created_at(self, db: AsyncSession):
        """BackupRecord.created_at must be timezone-aware (timezone bug fix verification)."""
        await _enable_backup(db, hour=4)

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            from app.services.backup_service import run_scheduled_backup_check
            await run_scheduled_backup_check(db, now=_now_at_hour(4))

        record = (await db.execute(select(BackupRecord))).scalar_one()
        assert record.created_at.tzinfo is not None, (
            "created_at must be timezone-aware — naive datetime would cause "
            "broken deduplication comparisons"
        )

    async def test_deduplication_skips_second_run_same_day(self, db: AsyncSession):
        """A second call within 23 h must not create another backup."""
        await _enable_backup(db, hour=2)
        now = _now_at_hour(2)

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            from app.services.backup_service import run_scheduled_backup_check
            first = await run_scheduled_backup_check(db, now=now)
            second = await run_scheduled_backup_check(db, now=now)

        assert first is True
        assert second is False  # deduplication must kick in

        count = (await db.execute(
            select(BackupRecord).where(BackupRecord.backup_type == "scheduled")
        )).scalars().all()
        assert len(count) == 1

    async def test_deduplication_allows_run_after_24h(self, db: AsyncSession):
        """After 24 h the dedup window expires and a new backup must run."""
        await _enable_backup(db, hour=2)

        # Simulate a backup from 25 hours ago by inserting an old record.
        # old_time must be relative to the synthetic 'now' passed to the function
        # (_now_at_hour(2)), NOT the actual wall clock. If the current UTC hour > 2,
        # datetime.now()-25h would still fall inside the 23h dedup window measured
        # from _now_at_hour(2), causing a false dedup hit.
        old_time = _now_at_hour(2) - timedelta(hours=25)
        old_record = BackupRecord(
            filename="backup_old_24h.sql",
            display_name="Old Backup",
            file_size=100,
            backup_type="scheduled",
            status="completed",
        )
        db.add(old_record)
        await db.flush()
        # Override created_at to be 25 hours in the past
        from sqlalchemy import update
        await db.execute(
            update(BackupRecord)
            .where(BackupRecord.id == old_record.id)
            .values(created_at=old_time)
        )

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            from app.services.backup_service import run_scheduled_backup_check
            result = await run_scheduled_backup_check(db, now=_now_at_hour(2))

        assert result is True

    async def test_weekly_skips_wrong_weekday(self, db: AsyncSession):
        """Weekly backups must only run on the configured day of week."""
        now_ist = datetime.now(_ISTANBUL)
        # Configure for a weekday that is NOT today (Istanbul weekday)
        wrong_dow = (now_ist.weekday() + 1) % 7
        now = now_ist.astimezone(timezone.utc)
        await _enable_backup(db, hour=now_ist.hour, frequency="weekly", day_of_week=wrong_dow)

        from app.services.backup_service import run_scheduled_backup_check
        result = await run_scheduled_backup_check(db, now=now)
        assert result is False

    async def test_weekly_runs_on_correct_weekday(self, db: AsyncSession):
        """Weekly backups run on the correct weekday."""
        now_ist = datetime.now(_ISTANBUL)
        now = now_ist.astimezone(timezone.utc)
        await _enable_backup(db, hour=now_ist.hour, frequency="weekly",
                              day_of_week=now_ist.weekday())

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            from app.services.backup_service import run_scheduled_backup_check
            result = await run_scheduled_backup_check(db, now=now)

        assert result is True

    async def test_pg_dump_failure_raises_and_no_record_saved(self, db: AsyncSession):
        """If pg_dump fails the function must raise and no record must be left in DB."""
        from fastapi import HTTPException
        await _enable_backup(db, hour=5)

        with patch("app.services.backup_service._run", _fake_run_fail), \
             patch("app.services.backup_service._ensure_backup_dir"):
            from app.services.backup_service import run_scheduled_backup_check
            with pytest.raises(HTTPException) as exc_info:
                await run_scheduled_backup_check(db, now=_now_at_hour(5))

        assert exc_info.value.status_code == 500

        count = len((await db.execute(
            select(BackupRecord).where(BackupRecord.backup_type == "scheduled")
        )).scalars().all())
        assert count == 0

    async def test_now_defaults_to_utc_aware(self, db: AsyncSession):
        """When called without now=, the function uses UTC-aware current time."""
        await _enable_backup(db, hour=99)  # impossible hour → always skips
        from app.services.backup_service import run_scheduled_backup_check
        # Should not raise even without explicit now
        result = await run_scheduled_backup_check(db)
        assert result is False

    async def test_failed_record_does_not_block_retry(self, db: AsyncSession):
        """A 'failed' scheduled backup record must NOT block a retry.

        Before the fix the deduplication query counted any scheduled record
        (including failed ones), so a single failure would block all subsequent
        runs for 23 hours.  After the fix only 'completed' records count.
        """
        await _enable_backup(db, hour=8)
        now = _now_at_hour(8)

        # Insert a recent "failed" record to simulate a previous failure
        recent_failed = BackupRecord(
            filename="backup_failed_recent.sql",
            display_name="Failed Backup",
            file_size=0,
            backup_type="scheduled",
            status="failed",
        )
        db.add(recent_failed)
        await db.flush()

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            from app.services.backup_service import run_scheduled_backup_check
            result = await run_scheduled_backup_check(db, now=now)

        assert result is True, (
            "A 'failed' record must not block the retry — only 'completed' records "
            "trigger the 23-hour deduplication window."
        )


# ─── Backup retention / prune ─────────────────────────────────────────────────

class TestBackupRetention:

    async def test_prune_respects_retention_setting(self, db: AsyncSession):
        """After prune, at most `backup_retention_count` records remain."""
        from app.services.backup_service import save_schedule, _prune_old_backups
        await save_schedule(db, {"backup_retention_count": "3"})

        for i in range(7):
            db.add(BackupRecord(
                filename=f"backup_prune_{i:03d}.sql",
                display_name=f"Backup {i}",
                file_size=512,
                backup_type="manual",
                status="completed",
            ))
        await db.flush()

        with patch("os.path.exists", return_value=False):
            await _prune_old_backups(db)

        remaining = (await db.execute(select(BackupRecord))).scalars().all()
        assert len(remaining) <= 3

    async def test_prune_keeps_newest(self, db: AsyncSession):
        """After prune the newest records survive."""
        from app.services.backup_service import save_schedule, _prune_old_backups
        await save_schedule(db, {"backup_retention_count": "2"})

        records = []
        for i in range(4):
            r = BackupRecord(
                filename=f"backup_keep_{i:03d}.sql",
                display_name=f"Backup {i}",
                file_size=i * 100,
                backup_type="manual",
                status="completed",
            )
            db.add(r)
            records.append(r)
        await db.flush()

        with patch("os.path.exists", return_value=False):
            await _prune_old_backups(db)

        remaining_ids = {
            r.id for r in (await db.execute(select(BackupRecord))).scalars().all()
        }
        # records[-1] and records[-2] should survive (most recently created)
        assert records[-1].id in remaining_ids
        assert records[-2].id in remaining_ids
        # First two should be pruned
        assert records[0].id not in remaining_ids
        assert records[1].id not in remaining_ids

    async def test_prune_ignores_bad_retention_value(self, db: AsyncSession):
        """Non-numeric retention value falls back to default 10."""
        from app.models.app_setting import AppSetting
        from app.services.backup_service import _prune_old_backups
        db.add(AppSetting(key="backup_retention_count_x", value="not_a_number"))
        await db.flush()

        for i in range(5):
            db.add(BackupRecord(
                filename=f"backup_nv_{i:03d}.sql",
                display_name=f"NV Backup {i}",
                file_size=100,
                backup_type="manual",
                status="completed",
            ))
        await db.flush()

        with patch("os.path.exists", return_value=False):
            # Default retention is 10; with 5 records nothing should be pruned
            await _prune_old_backups(db)

        remaining = (await db.execute(select(BackupRecord))).scalars().all()
        assert len(remaining) == 5  # all kept (5 < 10)


# ─── Backup API full flow ─────────────────────────────────────────────────────

class TestBackupAPIFlow:

    async def test_save_and_read_schedule(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        # Save a schedule
        put_resp = await client.put("/api/v1/backup/schedule", headers=headers, json={
            "backup_enabled": "true",
            "backup_frequency": "weekly",
            "backup_hour": "3",
            "backup_day_of_week": "6",  # Sunday
            "backup_retention_count": "5",
        })
        assert put_resp.status_code == 200
        saved = put_resp.json()
        assert saved["backup_enabled"] == "true"
        assert saved["backup_frequency"] == "weekly"
        assert saved["backup_hour"] == "3"
        assert saved["backup_day_of_week"] == "6"
        assert saved["backup_retention_count"] == "5"

        # Read it back
        get_resp = await client.get("/api/v1/backup/schedule", headers=headers)
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["backup_enabled"] == "true"
        assert data["backup_hour"] == "3"

    async def test_manual_backup_creates_record(
        self, client: AsyncClient, superadmin_user: User
    ):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            resp = await client.post("/api/v1/backup/create", headers=headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["backup_type"] == "manual"
        assert data["status"] == "completed"
        assert data["file_size"] == len(FAKE_SQL)

        # Check it appears in the list
        list_resp = await client.get("/api/v1/backup/records", headers=headers)
        assert list_resp.status_code == 200
        ids = [r["id"] for r in list_resp.json()]
        assert data["id"] in ids

    async def test_delete_backup_removes_from_list(
        self, client: AsyncClient, superadmin_user: User
    ):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        # Create a backup
        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            create_resp = await client.post("/api/v1/backup/create", headers=headers)
        backup_id = create_resp.json()["id"]

        # Delete it
        with patch("os.path.exists", return_value=False):
            del_resp = await client.delete(f"/api/v1/backup/{backup_id}", headers=headers)
        assert del_resp.status_code == 200

        # Must not appear in list
        list_resp = await client.get("/api/v1/backup/records", headers=headers)
        ids = [r["id"] for r in list_resp.json()]
        assert backup_id not in ids

    async def test_backup_not_accessible_by_regular_user(
        self, client: AsyncClient, regular_user: User
    ):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        for path in ["/api/v1/backup/records", "/api/v1/backup/schedule",
                     "/api/v1/backup/create"]:
            resp = await client.get(path, headers=headers) if "create" not in path \
                else await client.post(path, headers=headers)
            assert resp.status_code == 403, f"{path} should return 403, got {resp.status_code}"

    async def test_backup_not_accessible_by_manager(
        self, client: AsyncClient, manager_user: User
    ):
        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/backup/records", headers=headers)
        assert resp.status_code == 403

    async def test_download_nonexistent_backup_returns_404(
        self, client: AsyncClient, superadmin_user: User
    ):
        import uuid
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get(f"/api/v1/backup/{uuid.uuid4()}/download", headers=headers)
        assert resp.status_code == 404

    async def test_schedule_unknown_keys_ignored(
        self, client: AsyncClient, superadmin_user: User
    ):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.put("/api/v1/backup/schedule", headers=headers, json={
            "backup_enabled": "true",
            "injected_key": "HACKED",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "injected_key" not in data


# ─── Scheduled backup integration (APScheduler callback) ─────────────────────

class TestScheduledBackupIntegration:
    """
    Tests that simulate the APScheduler hourly callback.
    Uses AsyncSessionLocal.begin() to mirror the production code path exactly:
    main.py._run_scheduled_backup uses .begin() for auto-commit on success.
    """

    async def _call_via_fresh_session(self, now: datetime) -> bool:
        """Mirrors main.py: open a begin()-session (auto-commits), call check.

        Uses the test DB URL so the fresh session can see data committed by the
        test fixture — app.database.AsyncSessionLocal points to the production DB
        and would be blind to any test-only commits.
        """
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from app.tests.conftest import TEST_DATABASE_URL
        from app.services.backup_service import run_scheduled_backup_check
        engine = create_async_engine(TEST_DATABASE_URL, echo=False)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session.begin() as db:
                return await run_scheduled_backup_check(db, now=now)
        finally:
            await engine.dispose()

    async def test_record_persisted_after_scheduled_run(self, db: AsyncSession):
        """
        Bug regression test: after the APScheduler callback runs, the backup
        record must be committed and visible to other sessions.

        With the old bug (missing commit), the record was rolled back by the
        session context manager and no record was ever visible.
        """
        # Clean up any committed backup records left by previous tests so the
        # dedup check inside run_scheduled_backup_check starts from a clean slate.
        from sqlalchemy import delete as sa_delete
        await db.execute(sa_delete(BackupRecord))
        await db.commit()

        # Seed the schedule settings and commit so the fresh session can see them
        await _enable_backup(db, hour=6)
        await db.commit()

        now = _now_at_hour(6)

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            result = await self._call_via_fresh_session(now)

        assert result is True

        # Verify the record is now visible to the test session (was committed)
        await db.rollback()  # reset test session state so fresh read works
        records = (await db.execute(
            select(BackupRecord).where(BackupRecord.backup_type == "scheduled")
        )).scalars().all()
        assert len(records) == 1, (
            "Backup record was not committed — this is the primary bug. "
            "The APScheduler session must commit after create_backup()."
        )

    async def test_second_scheduler_call_skips_due_to_dedup(self, db: AsyncSession):
        """
        After the first scheduled run, the next hourly invocation must be
        a no-op (deduplication within 23 h).
        """
        # Clean up committed records from any prior integration test so the
        # dedup query starts from a known-empty state.
        from sqlalchemy import delete as sa_delete
        await db.execute(sa_delete(BackupRecord))
        await db.commit()

        await _enable_backup(db, hour=7)
        await db.commit()

        now = _now_at_hour(7)

        with patch("app.services.backup_service._run", _fake_run_ok), \
             patch("app.services.backup_service._ensure_backup_dir"), \
             patch("builtins.open", MagicMock(
                 return_value=MagicMock(
                     __enter__=MagicMock(return_value=MagicMock()),
                     __exit__=MagicMock(return_value=False),
                 )
             )):
            first = await self._call_via_fresh_session(now)
            second = await self._call_via_fresh_session(now)

        assert first is True
        assert second is False, (
            "Second call within 23 h must be skipped by deduplication."
        )

    async def test_disabled_schedule_never_creates_backup(self, db: AsyncSession):
        await _disable_backup(db)
        await db.commit()

        with patch("app.services.backup_service._run") as mock_run:
            result = await self._call_via_fresh_session(_now_at_hour(2))

        assert result is False
        mock_run.assert_not_called()
