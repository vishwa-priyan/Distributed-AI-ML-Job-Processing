"""
Task execution engine for distributed workers.
Handles validation, leasing, execution telemetry, retry tracking, and atomic persistence.
"""

import os
import sys
import time
import json
import logging
import psycopg
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from workers.app.handlers.ml_handlers import HANDLERS
from workers.app.resource_monitor.telemetry import get_system_metrics

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] [WorkerExecutor] %(message)s')
logger = logging.getLogger("WorkerExecutor")

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:1234@localhost:5432/distributed_ml")

def get_db_connection():
    return psycopg.connect(DB_URL, autocommit=True)

class TaskExecutor:
    def __init__(self, worker_id: str):
        self.worker_id = worker_id

    def execute_task(self, task_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes a task envelope safely and authoritatively updates PostgreSQL.
        """
        task_id = task_payload['task_id']
        job_id = task_payload['job_id']
        task_type = task_payload['task_type']
        input_path = task_payload['input_path']
        output_path = task_payload['output_path']
        params = task_payload.get('parameters', {})
        attempt_number = task_payload.get('attempt_number', 1)

        logger.info(f"Worker {self.worker_id} starting task {task_id} (Attempt #{attempt_number}, Type: {task_type})")

        if task_type not in HANDLERS:
            err_msg = f"Unknown or disallowed task type: {task_type}"
            self._record_task_failure(task_id, job_id, attempt_number, err_msg)
            raise ValueError(err_msg)

        # 1. Update lease and task status to RUNNING
        lease_duration = timedelta(seconds=120)
        lease_expires = datetime.now(timezone.utc) + lease_duration

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE job_tasks 
                    SET status = 'RUNNING',
                        assigned_worker_id = %s,
                        lease_expires_at = %s,
                        started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND (lease_expires_at IS NULL OR lease_expires_at > CURRENT_TIMESTAMP OR assigned_worker_id = %s)
                """, (self.worker_id, lease_expires, task_id, self.worker_id))

                cur.execute("""
                    INSERT INTO task_attempts (task_id, worker_id, attempt_number, status, started_at)
                    VALUES (%s, %s, %s, 'RUNNING', CURRENT_TIMESTAMP)
                    ON CONFLICT (task_id, attempt_number) 
                    DO UPDATE SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP
                """, (task_id, self.worker_id, attempt_number))

                # Update job status to RUNNING if not already
                cur.execute("""
                    UPDATE jobs 
                    SET status = 'RUNNING', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP 
                    WHERE id = %s AND status IN ('QUEUED', 'SCHEDULED')
                """, (job_id,))

        handler_fn = HANDLERS[task_type]
        call_params = {
            "task_id": task_id,
            "job_id": job_id,
            "input_path": input_path,
            "output_path": output_path,
            **params
        }

        # 2. Execute workload with resource telemetry
        metrics_before = get_system_metrics()
        start_time = time.time()
        
        try:
            result = handler_fn(call_params)
            execution_time_ms = int((time.time() - start_time) * 1000)
            metrics_after = get_system_metrics()
            
            avg_cpu = round((metrics_before['cpu_percent'] + metrics_after['cpu_percent']) / 2, 2)
            mem_used_mb = metrics_after['proc_memory_mb']

            # 3. Mark task completed in database
            self._record_task_success(
                task_id=task_id,
                job_id=job_id,
                attempt_number=attempt_number,
                output_path=output_path,
                execution_time_ms=execution_time_ms,
                cpu_percent=avg_cpu,
                memory_mb=mem_used_mb,
                result=result
            )

            logger.info(f"Worker {self.worker_id} successfully completed task {task_id} in {execution_time_ms}ms")
            return result

        except Exception as e:
            execution_time_ms = int((time.time() - start_time) * 1000)
            err_msg = str(e)
            logger.error(f"Worker {self.worker_id} failed on task {task_id}: {err_msg}")
            self._record_task_failure(
                task_id=task_id,
                job_id=job_id,
                attempt_number=attempt_number,
                error_message=err_msg,
                execution_time_ms=execution_time_ms
            )
            raise

    def _record_task_success(self, task_id: str, job_id: str, attempt_number: int, output_path: str, execution_time_ms: int, cpu_percent: float, memory_mb: float, result: Dict[str, Any]):
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE job_tasks
                    SET status = 'COMPLETED',
                        output_data_path = %s,
                        completed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (output_path, task_id))

                cur.execute("""
                    UPDATE task_attempts
                    SET status = 'COMPLETED',
                        completed_at = CURRENT_TIMESTAMP,
                        execution_time_ms = %s,
                        cpu_percent = %s,
                        memory_mb = %s
                    WHERE task_id = %s AND attempt_number = %s
                """, (execution_time_ms, cpu_percent, memory_mb, task_id, attempt_number))

                # Also mark batch completed if associated
                cur.execute("""
                    UPDATE job_batches
                    SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
                    WHERE id = (SELECT batch_id FROM job_tasks WHERE id = %s)
                """, (task_id,))

                # Increment completed batches count on job
                cur.execute("""
                    UPDATE jobs
                    SET completed_batches = completed_batches + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (job_id,))

                # Check if all tasks for the job are complete
                cur.execute("""
                    SELECT COUNT(*) as total, 
                           SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
                           SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
                    FROM job_tasks
                    WHERE job_id = %s
                """, (job_id,))
                row = cur.fetchone()
                total_tasks, completed_tasks, failed_tasks = row[0], row[1] or 0, row[2] or 0

                if completed_tasks == total_tasks:
                    logger.info(f"All {total_tasks} tasks for job {job_id} complete. Aggregating results...")
                    self._aggregate_job_results(cur, job_id)

    def _record_task_failure(self, task_id: str, job_id: str, attempt_number: int, error_message: str, execution_time_ms: int = 0):
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT max_retries FROM jobs WHERE id = %s
                """, (job_id,))
                res = cur.fetchone()
                max_retries = res[0] if res else 3

                cur.execute("""
                    UPDATE task_attempts
                    SET status = 'FAILED',
                        completed_at = CURRENT_TIMESTAMP,
                        execution_time_ms = %s,
                        error_details = %s
                    WHERE task_id = %s AND attempt_number = %s
                """, (execution_time_ms, error_message, task_id, attempt_number))

                if attempt_number < max_retries:
                    # Mark task for retry
                    cur.execute("""
                        UPDATE job_tasks
                        SET status = 'QUEUED',
                            retry_count = retry_count + 1,
                            assigned_worker_id = NULL,
                            lease_expires_at = NULL,
                            error_message = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (error_message, task_id))

                    cur.execute("""
                        UPDATE jobs
                        SET status = 'RETRYING',
                            error_message = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (f"Task retry #{attempt_number}: {error_message}", job_id))
                else:
                    # Exhausted retries
                    cur.execute("""
                        UPDATE job_tasks
                        SET status = 'FAILED',
                            error_message = %s,
                            completed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (error_message, task_id))

                    cur.execute("""
                        UPDATE jobs
                        SET status = 'FAILED',
                            failed_batches = failed_batches + 1,
                            error_message = %s,
                            completed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (f"Task failed after {attempt_number} attempts: {error_message}", job_id))

    def _aggregate_job_results(self, cur, job_id: str):
        """
        Deterministically aggregates completed batch chunks into a single result artifact.
        """
        cur.execute("""
            SELECT jt.output_data_path, jb.batch_index
            FROM job_tasks jt
            LEFT JOIN job_batches jb ON jt.batch_id = jb.id
            WHERE jt.job_id = %s AND jt.status = 'COMPLETED'
            ORDER BY COALESCE(jb.batch_index, 0) ASC
        """, (job_id,))
        rows = cur.fetchall()

        if not rows:
            return

        cur.execute("SELECT job_type FROM jobs WHERE id = %s", (job_id,))
        job_type = cur.fetchone()[0]

        final_artifact_path = f"storage/artifacts/{job_id}_final_result.csv"
        os.makedirs("storage/artifacts", exist_ok=True)

        if job_type in ['csv_batch_inference', 'data_preprocessing', 'image_classification']:
            import pandas as pd
            dfs = []
            for r in rows:
                chunk_file = r[0]
                if chunk_file and os.path.exists(chunk_file):
                    dfs.append(pd.read_csv(chunk_file))
            
            if dfs:
                combined_df = pd.concat(dfs, ignore_index=True)
                from workers.app.result_writer.atomic_writer import write_atomic_csv
                target_file, file_size, checksum = write_atomic_csv(combined_df, final_artifact_path)

                cur.execute("""
                    INSERT INTO result_artifacts (job_id, artifact_name, artifact_type, storage_path, file_size_bytes, checksum_sha256)
                    VALUES (%s, %s, 'csv_result', %s, %s, %s)
                """, (job_id, f"result_{job_id}.csv", target_file, file_size, checksum))

        elif job_type in ['model_evaluation', 'model_training']:
            # The last output is already the JSON or model artifact
            final_artifact_path = rows[-1][0]
            if os.path.exists(final_artifact_path):
                file_size = os.path.getsize(final_artifact_path)
                from workers.app.result_writer.atomic_writer import compute_sha256
                checksum = compute_sha256(final_artifact_path)
                cur.execute("""
                    INSERT INTO result_artifacts (job_id, artifact_name, artifact_type, storage_path, file_size_bytes, checksum_sha256)
                    VALUES (%s, %s, 'evaluation_metrics', %s, %s, %s)
                """, (job_id, os.path.basename(final_artifact_path), final_artifact_path, file_size, checksum))

        # Mark job COMPLETED
        cur.execute("""
            UPDATE jobs
            SET status = 'COMPLETED',
                result_path = %s,
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (final_artifact_path, job_id))

        # Record state transition
        cur.execute("""
            INSERT INTO job_state_transitions (job_id, from_status, to_status, trigger_event, message)
            VALUES (%s, 'RUNNING', 'COMPLETED', 'ALL_TASKS_COMPLETED', 'Job completed successfully and all artifacts aggregated.')
        """, (job_id,))
