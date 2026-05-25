from celery import Celery
from app.config import settings

celery_app = Celery(
    "teamapp",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.email_tasks"],
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
}
