"""
Dedicated Intelligent Scheduling Service.
Continuously coordinates tasks, evaluates resource-aware and predictive placement,
records scheduling decisions, monitors worker heartbeats, and recovers from failures.
"""

import os
import sys

# Ensure monorepo root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import time
import json
import logging
import threading
import psycopg
import redis
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import FastAPI
import uvicorn

from scheduler.app.policies.strategies import (
    RoundRobinStrategy,
    LeastLoadedStrategy,
    ResourceAwareStrategy,
    PredictiveStrategy
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] [SchedulerService] %(message)s')
logger = logging.getLogger("SchedulerService")

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:1234@localhost:5432/distributed_ml")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

app = FastAPI(title="Distributed ML Scheduler Service", version="1.0.0")

class SchedulerEngine:
    def __init__(self):
        self.redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        self.strategies = {
            'round_robin': RoundRobinStrategy(),
            'least_loaded': LeastLoadedStrategy(),
            'resource_aware': ResourceAwareStrategy(),
            'predictive': PredictiveStrategy()
        }
        self.is_running = False
        self.scheduling_thread = None
        self.recovery_thread = None

    def get_eligible_workers(self, task_type: str) -> List[Dict[str, Any]]:
        """
        Retrieves active, healthy workers capable of handling task_type.
        """
        with psycopg.connect(DB_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                # 20 second heartbeat timeout window
                cur.execute("""
                    SELECT id, name, hostname, status, max_concurrency, 
                           cpu_cores, total_ram_mb, has_gpu, supported_job_types, drain_mode
                    FROM workers
                    WHERE status != 'OFFLINE'
                      AND last_heartbeat_at >= CURRENT_TIMESTAMP - INTERVAL '20 seconds'
                """)
                workers = []
                for row in cur.fetchall():
                    supported = row[8]
                    # Handle json or list
                    if isinstance(supported, str):
                        try:
                            supported = json.loads(supported)
                        except Exception:
                            supported = []

                    # Exclude if draining or doesn't support task_type
                    if bool(row[9]): # drain_mode
                        continue
                    if supported and task_type not in supported:
                        continue

                    workers.append({
                        "id": row[0],
                        "name": row[1],
                        "hostname": row[2],
                        "status": row[3],
                        "max_concurrency": row[4],
                        "cpu_cores": row[5],
                        "total_ram_mb": row[6],
                        "has_gpu": bool(row[7]),
                        "drain_mode": bool(row[9])
                    })
                return workers

    def get_worker_telemetry(self, worker_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """Gathers latest telemetry reported by workers in Redis."""
        telemetry = {}
        for w_id in worker_ids:
            data = self.redis_client.hgetall(f"worker:{w_id}:heartbeat")
            if data:
                telemetry[w_id] = {
                    "cpu_percent": float(data.get("cpu_percent", 20.0)),
                    "available_ram_mb": float(data.get("available_ram_mb", 4096.0)),
                    "active_tasks": int(data.get("active_tasks", 0)),
                    "drain_mode": bool(int(data.get("drain_mode", 0)))
                }
            else:
                telemetry[w_id] = {
                    "cpu_percent": 30.0,
                    "available_ram_mb": 4096.0,
                    "active_tasks": 0,
                    "drain_mode": False
                }
        return telemetry

    def dispatch_task(self, task: Dict[str, Any], worker: Dict[str, Any], reason: str, predicted_ms: Optional[int], latency_ms: float):
        """
        Commits scheduling decision to database and pushes task payload to Redis queue.
        """
        task_id = task['id']
        job_id = task['job_id']
        strategy = task.get('scheduling_strategy', 'resource_aware')

        with psycopg.connect(DB_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                # 1. Update task to SCHEDULED
                cur.execute("""
                    UPDATE job_tasks
                    SET status = 'SCHEDULED',
                        assigned_worker_id = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (worker['id'], task_id))

                # 2. Update job status to SCHEDULED if was QUEUED
                cur.execute("""
                    UPDATE jobs
                    SET status = 'SCHEDULED', updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND status = 'QUEUED'
                """, (job_id,))

                # 3. Record scheduling decision
                cur.execute("""
                    INSERT INTO scheduling_decisions (
                        job_id, task_id, strategy_used, candidate_workers_json,
                        selected_worker_id, predicted_exec_time_ms, decision_reason, scheduling_latency_ms
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    job_id, task_id, strategy,
                    json.dumps([{"id": worker['id'], "name": worker['name']}]),
                    worker['id'], predicted_ms, reason, latency_ms
                ))

        # 4. Push payload to worker's dedicated queue in Redis
        task_envelope = {
            "task_id": task_id,
            "job_id": job_id,
            "task_type": task['task_type'],
            "input_path": task['input_data_path'],
            "output_path": task['output_data_path'] or f"storage/batches/{task_id}_result.csv",
            "parameters": task.get('parameters_json', {}),
            "attempt_number": task.get('retry_count', 0) + 1,
            "assigned_worker_id": worker['id']
        }
        self.redis_client.rpush(f"queue:{worker['id']}", json.dumps(task_envelope))
        logger.info(f"Dispatched task {task_id} to worker {worker['id']} via {strategy} ({reason})")

    def schedule_cycle(self):
        """Fetches pending QUEUED tasks and assigns them to eligible workers."""
        with psycopg.connect(DB_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT jt.id, jt.job_id, jt.task_type, jt.input_data_path, jt.output_data_path,
                           jt.retry_count, j.scheduling_strategy, j.priority, j.parameters_json,
                           COALESCE(jb.record_count, 500) as record_count
                    FROM job_tasks jt
                    JOIN jobs j ON jt.job_id = j.id
                    LEFT JOIN job_batches jb ON jt.batch_id = jb.id
                    WHERE jt.status = 'QUEUED'
                    ORDER BY j.priority DESC, jt.created_at ASC
                    LIMIT 20;
                """)
                rows = cur.fetchall()

        if not rows:
            return

        for r in rows:
            t0 = time.time()
            task = {
                "id": str(r[0]),
                "job_id": str(r[1]),
                "task_type": r[2],
                "input_data_path": r[3],
                "output_data_path": r[4],
                "retry_count": r[5],
                "scheduling_strategy": r[6] or 'resource_aware',
                "priority": r[7],
                "parameters_json": r[8] if isinstance(r[8], dict) else {},
                "record_count": r[9]
            }

            candidates = self.get_eligible_workers(task['task_type'])
            if not candidates:
                # No active workers available
                continue

            telemetry = self.get_worker_telemetry([w['id'] for w in candidates])
            strategy_name = task['scheduling_strategy'].lower()
            strategy = self.strategies.get(strategy_name, self.strategies['resource_aware'])

            selected_worker, reason, pred_ms = strategy.select_worker(task, candidates, telemetry)
            latency_ms = round((time.time() - t0) * 1000, 3)

            if selected_worker:
                self.dispatch_task(task, selected_worker, reason, pred_ms, latency_ms)

    def recover_dead_workers(self):
        """
        Detects worker heartbeat timeouts, marks workers OFFLINE, and requeues stalled tasks.
        """
        with psycopg.connect(DB_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                # 1. Identify dead workers (no heartbeat in 25 seconds)
                cur.execute("""
                    UPDATE workers
                    SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP
                    WHERE status != 'OFFLINE'
                      AND last_heartbeat_at < CURRENT_TIMESTAMP - INTERVAL '25 seconds'
                    RETURNING id;
                """)
                dead_workers = [row[0] for row in cur.fetchall()]

                for w_id in dead_workers:
                    logger.warning(f"Detected offline/dead worker: {w_id}. Recovering orphaned tasks...")
                    # 2. Re-queue tasks assigned to dead worker whose lease expired or were running
                    cur.execute("""
                        UPDATE job_tasks
                        SET status = 'QUEUED',
                            assigned_worker_id = NULL,
                            lease_expires_at = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE assigned_worker_id = %s
                          AND status IN ('SCHEDULED', 'RUNNING')
                        RETURNING id, job_id;
                    """, (w_id,))
                    requeued = cur.fetchall()
                    if requeued:
                        logger.info(f"Re-queued {len(requeued)} orphaned tasks from dead worker {w_id}.")

    def start(self):
        self.is_running = True

        def scheduling_loop():
            logger.info("Scheduler loop started.")
            while self.is_running:
                try:
                    self.schedule_cycle()
                except Exception as e:
                    logger.error(f"Error in scheduling loop: {e}")
                time.sleep(1.0)

        def recovery_loop():
            logger.info("Fault tolerance recovery loop started.")
            while self.is_running:
                try:
                    self.recover_dead_workers()
                except Exception as e:
                    logger.error(f"Error in recovery loop: {e}")
                time.sleep(5.0)

        self.scheduling_thread = threading.Thread(target=scheduling_loop, daemon=True)
        self.recovery_thread = threading.Thread(target=recovery_loop, daemon=True)
        self.scheduling_thread.start()
        self.recovery_thread.start()

scheduler_engine = SchedulerEngine()

@app.on_event("startup")
def on_startup():
    scheduler_engine.start()

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "scheduler",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/policies")
def get_policies():
    return {
        "available_policies": list(scheduler_engine.strategies.keys()),
        "default": "resource_aware"
    }

@app.post("/trigger")
def trigger_schedule():
    scheduler_engine.schedule_cycle()
    return {"status": "triggered"}

if __name__ == '__main__':
    port = int(os.environ.get("SCHEDULER_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
