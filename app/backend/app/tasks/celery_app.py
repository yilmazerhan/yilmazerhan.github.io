from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "teamapp",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.email_tasks", "app.tasks.scheduled_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Istanbul",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # Broker connection settings.
    # retry_on_startup=True: if Redis is briefly unavailable when the worker
    # starts, Celery retries rather than exiting (important after container
    # restarts where Redis may not be fully ready yet).
    broker_connection_timeout=3,
    broker_connection_retry_on_startup=True,
    broker_transport_options={
        "socket_connect_timeout": 3,
        "socket_timeout": 120,   # allow blocking BRPOP to wait up to 120 s
        "retry_on_timeout": True,
    },
)

celery_app.conf.beat_schedule = {
    "evaluate-workflows-every-15min": {
        "task": "app.tasks.email_tasks.evaluate_scheduled_workflows",
        "schedule": 900.0,  # 15 minutes
    },
    "refresh-jira-statuses-hourly": {
        "task": "app.tasks.email_tasks.refresh_jira_statuses",
        "schedule": 3600.0,  # 1 hour
    },
    # Backup and inventory checks moved from APScheduler (ran per-worker) to
    # Celery Beat (single process) to prevent duplicate execution with --workers N.
    "run-backup-check-minutely": {
        "task": "app.tasks.scheduled_tasks.run_backup_check",
        # Fire every minute so minute-level backup time precision works.
        # The service itself checks hour+minute against the configured schedule
        # and deduplicates via the 23-hour recent-backup window.
        "schedule": crontab(minute='*'),
    },
    "run-inventory-email-check-hourly": {
        "task": "app.tasks.scheduled_tasks.run_inventory_email_check",
        "schedule": 3600.0,  # 1 hour
    },
    "send-worklog-reminders-daily": {
        "task": "app.tasks.email_tasks.send_worklog_reminders",
        "schedule": crontab(hour=17, minute=0, day_of_week="1-5"),  # Mon-Fri 17:00 Istanbul
    },
}
