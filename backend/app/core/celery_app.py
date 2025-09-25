"""
Celery application configuration for background task processing
"""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "owox_data_marts",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.linkedin_tasks",
        "app.tasks.google_tasks",
        "app.tasks.data_collection_tasks",
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
    task_routes={
        "app.tasks.linkedin_tasks.*": {"queue": "linkedin"},
        "app.tasks.google_tasks.*": {"queue": "google"},
        "app.tasks.data_collection_tasks.*": {"queue": "data_collection"},
    },
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=1000,
)

# Task result expires after 1 hour
celery_app.conf.result_expires = 3600

if __name__ == "__main__":
    celery_app.start()
