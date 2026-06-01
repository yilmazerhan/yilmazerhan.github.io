from celery import Celery
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
    # Broker connection timeouts — fail fast when Redis is not available
    # so the API doesn't block waiting for broker connection
    broker_connection_timeout=2,           # seconds to wait for initial connect
    broker_connection_retry_on_startup=False,
    broker_transport_options={
        "socket_connect_timeout": 2,
        "socket_timeout": 2,
        "retry_on_timeout": False,
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
    "run-backup-check-hourly": {
        "task": "app.tasks.scheduled_tasks.run_backup_check",
        "schedule": 3600.0,  # 1 hour
    },
    "run-inventory-email-check-hourly": {
        "task": "app.tasks.scheduled_tasks.run_inventory_email_check",
        "schedule": 3600.0,  # 1 hour
    },
}
