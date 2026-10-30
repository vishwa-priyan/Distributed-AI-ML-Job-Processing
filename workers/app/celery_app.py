"""
Celery configuration for distributed task execution.
Broker: Redis (redis://localhost:6379/0)
Backend: Redis
"""

import os
from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "distributed_ml_workers",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    task_routes={
        "process_ml_task": {"queue": "ml_tasks"}
    }
)

@celery_app.task(name="process_ml_task", bind=True, max_retries=3)
def process_ml_task(self, task_payload):
    """
    Celery task wrapper that delegates execution to TaskExecutor.
    """
    from workers.app.tasks.executor import TaskExecutor
    worker_id = task_payload.get('assigned_worker_id', os.environ.get('WORKER_ID', 'worker-default'))
    executor = TaskExecutor(worker_id=worker_id)
    return executor.execute_task(task_payload)
