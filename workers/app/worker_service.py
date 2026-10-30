"""
Independent Distributed Worker Process.
Supports:
- Dynamic registration with PostgreSQL & Redis
- Continuous real psutil telemetry heartbeat
- Drain mode & graceful shutdown
- Windows & Linux compatibility
- Direct task queue consumption
"""

import os
import sys

# Ensure monorepo root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import time
import socket
import json
import signal
import threading
import psycopg
import redis
from datetime import datetime, timezone
from typing import Optional

from workers.app.resource_monitor.telemetry import get_system_metrics
from workers.app.tasks.executor import TaskExecutor

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:1234@localhost:5432/distributed_ml")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

class WorkerService:
    def __init__(self, worker_id: str, name: Optional[str] = None, concurrency: int = 4):
        self.worker_id = worker_id
        self.hostname = socket.gethostname()
        self.name = name or f"Node-{self.worker_id}"
        self.concurrency = concurrency
        self.is_running = False
        self.drain_mode = False
        self.active_tasks_count = 0
        self.redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        self.executor = TaskExecutor(worker_id=self.worker_id)
        self.heartbeat_thread = None

    def register(self):
        """Registers or updates worker in PostgreSQL and Redis."""
        metrics = get_system_metrics()
        with psycopg.connect(DB_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO workers (
                        id, name, hostname, status, max_concurrency, 
                        cpu_cores, total_ram_mb, has_gpu, gpu_name, 
                        drain_mode, last_heartbeat_at, registered_at
                    )
                    VALUES (%s, %s, %s, 'ONLINE', %s, %s, %s, %s, %s, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET
                        status = 'ONLINE',
                        hostname = EXCLUDED.hostname,
                        cpu_cores = EXCLUDED.cpu_cores,
                        total_ram_mb = EXCLUDED.total_ram_mb,
                        has_gpu = EXCLUDED.has_gpu,
                        gpu_name = EXCLUDED.gpu_name,
                        drain_mode = FALSE,
                        last_heartbeat_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP;
                """, (
                    self.worker_id, self.name, self.hostname, self.concurrency,
                    metrics['cpu_cores'], metrics['total_ram_mb'], metrics['has_gpu'], metrics['gpu_name']
                ))
        
        # Also register in Redis set of active workers
        self.redis_client.sadd("active_workers", self.worker_id)
        self.redis_client.hset(f"worker:{self.worker_id}:info", mapping={
            "id": self.worker_id,
            "hostname": self.hostname,
            "status": "ONLINE",
            "cpu_cores": str(metrics['cpu_cores']),
            "total_ram_mb": str(metrics['total_ram_mb']),
            "has_gpu": str(int(metrics['has_gpu'])),
            "max_concurrency": str(self.concurrency)
        })
        print(f"[WorkerService] Worker {self.worker_id} ({self.name}) registered successfully.")

    def start_heartbeat(self):
        """Sends periodic heartbeats with genuine psutil metrics."""
        def heartbeat_loop():
            while self.is_running:
                try:
                    metrics = get_system_metrics()
                    
                    # Update PostgreSQL
                    with psycopg.connect(DB_URL, autocommit=True) as conn:
                        with conn.cursor() as cur:
                            cur.execute("""
                                UPDATE workers
                                SET last_heartbeat_at = CURRENT_TIMESTAMP,
                                    status = CASE WHEN drain_mode THEN 'DRAINING' ELSE 'ONLINE' END,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = %s
                                RETURNING drain_mode;
                            """, (self.worker_id,))
                            row = cur.fetchone()
                            if row:
                                self.drain_mode = bool(row[0])

                            # Record heartbeat telemetry sample
                            cur.execute("""
                                INSERT INTO worker_heartbeats (worker_id, cpu_utilization, memory_utilization_mb, active_tasks, timestamp)
                                VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                            """, (
                                self.worker_id,
                                metrics['cpu_percent'],
                                metrics['total_ram_mb'] - metrics['available_ram_mb'],
                                self.active_tasks_count
                            ))

                    # Update Redis heartbeat
                    self.redis_client.hset(f"worker:{self.worker_id}:heartbeat", mapping={
                        "cpu_percent": str(metrics['cpu_percent']),
                        "available_ram_mb": str(metrics['available_ram_mb']),
                        "active_tasks": str(self.active_tasks_count),
                        "timestamp": str(time.time()),
                        "drain_mode": str(int(self.drain_mode))
                    })
                    self.redis_client.expire(f"worker:{self.worker_id}:heartbeat", 20)

                except Exception as e:
                    print(f"[Heartbeat Warning] Error sending heartbeat for {self.worker_id}: {e}")

                time.sleep(5)

        self.heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
        self.heartbeat_thread.start()

    def run(self):
        """Main worker queue consumer loop."""
        self.is_running = True
        self.register()
        self.start_heartbeat()

        worker_queue = f"queue:{self.worker_id}"
        shared_queue = "queue:ml_tasks"
        print(f"[WorkerService] Worker {self.worker_id} listening on [{worker_queue}, {shared_queue}]...")

        while self.is_running:
            if self.drain_mode and self.active_tasks_count == 0:
                print(f"[WorkerService] Worker {self.worker_id} in drain mode. No active tasks. Standing by...")
                time.sleep(2)
                continue

            try:
                # Poll worker-specific queue first, then fallback to shared queue
                task_item = self.redis_client.lpop(worker_queue) or self.redis_client.lpop(shared_queue)
                if not task_item:
                    time.sleep(0.5)
                    continue

                task_data = json.loads(task_item)
                self.active_tasks_count += 1

                try:
                    self.executor.execute_task(task_data)
                except Exception as task_err:
                    print(f"[WorkerService] Error executing task: {task_err}")
                finally:
                    self.active_tasks_count = max(0, self.active_tasks_count - 1)

            except Exception as loop_err:
                time.sleep(1)

    def shutdown(self):
        """Gracefully shuts down the worker."""
        print(f"[WorkerService] Shutting down worker {self.worker_id}...")
        self.is_running = False
        try:
            with psycopg.connect(DB_URL, autocommit=True) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE workers
                        SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (self.worker_id,))
            self.redis_client.srem("active_workers", self.worker_id)
            self.redis_client.delete(f"worker:{self.worker_id}:heartbeat")
        except Exception:
            pass
        print(f"[WorkerService] Worker {self.worker_id} stopped.")

def main():
    worker_id = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("WORKER_ID", "worker-cpu-01")
    name = sys.argv[2] if len(sys.argv) > 2 else f"Compute-{worker_id}"
    service = WorkerService(worker_id=worker_id, name=name)

    def handle_signal(sig, frame):
        service.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    service.run()

if __name__ == '__main__':
    main()
