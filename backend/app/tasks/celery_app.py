from celery import Celery
from app.core.config import settings
import os

# Create Celery instance
celery_app = Celery(
    "owox_data_marts",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.data_mart_tasks",
        "app.tasks.connector_tasks",
        "app.tasks.report_tasks",
        "app.tasks.cleanup_tasks",
    ]
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    result_expires=3600,  # 1 hour
    task_routes={
        "app.tasks.data_mart_tasks.*": {"queue": "data_marts"},
        "app.tasks.connector_tasks.*": {"queue": "connectors"},
        "app.tasks.report_tasks.*": {"queue": "reports"},
        "app.tasks.cleanup_tasks.*": {"queue": "cleanup"},
    },
    task_default_queue="default",
    task_default_exchange="default",
    task_default_routing_key="default",
)

# Beat schedule for periodic tasks
celery_app.conf.beat_schedule = {
    "cleanup-expired-cache": {
        "task": "app.tasks.cleanup_tasks.cleanup_expired_cache",
        "schedule": 3600.0,  # Every hour
    },
    "cleanup-old-runs": {
        "task": "app.tasks.cleanup_tasks.cleanup_old_runs",
        "schedule": 86400.0,  # Every day
    },
    "process-scheduled-triggers": {
        "task": "app.tasks.data_mart_tasks.process_scheduled_triggers",
        "schedule": 60.0,  # Every minute
    },
}

if __name__ == "__main__":
    celery_app.start()
