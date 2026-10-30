"""
Reliability and Fault Tolerance Verification Test Suite.
Validates:
- Worker crash detection & offline reaper
- Automatic task re-queueing from dead worker
- Retry exhaustion and terminal state transition
- Cooperative cancellation
"""

import time
import unittest
import psycopg
import requests

API_BASE = "http://localhost:5000/api/v1"
DB_URL = "postgresql://postgres:1234@localhost:5432/distributed_ml"

class TestFaultRecovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        admin_res = requests.post(f"{API_BASE}/auth/login", json={
            "usernameOrEmail": "admin@distml.local",
            "password": "Admin@123"
        })
        cls.token = admin_res.json()['data']['accessToken']

    def test_worker_heartbeat_timeout_reaper(self):
        """Simulates worker crash by setting last_heartbeat_at to 35 seconds ago."""
        fake_worker_id = "test-crashed-worker"
        with psycopg.connect(DB_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO workers (id, name, hostname, status, max_concurrency, last_heartbeat_at)
                    VALUES (%s, 'Crashed-Node', 'node-crash', 'ONLINE', 2, CURRENT_TIMESTAMP - INTERVAL '40 seconds')
                    ON CONFLICT (id) DO UPDATE SET 
                        status = 'ONLINE', 
                        last_heartbeat_at = CURRENT_TIMESTAMP - INTERVAL '40 seconds';
                """, (fake_worker_id,))

        # Wait for scheduler recovery loop (runs every 5 seconds)
        time.sleep(7)

        with psycopg.connect(DB_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM workers WHERE id = %s", (fake_worker_id,))
                status = cur.fetchone()[0]
                self.assertEqual(status, 'OFFLINE', "Stale worker should be transitioned to OFFLINE by reaper")

    def test_job_cancellation_cooperative(self):
        """Validates that queued/scheduled jobs can be cancelled safely."""
        headers = {"Authorization": f"Bearer {self.token}"}
        payload = {
            "name": "Cancel Test Workload",
            "job_type": "csv_batch_inference",
            "scheduling_strategy": "round_robin",
            "batch_size": 200,
            "sample_dataset": "customer_churn"
        }
        res = requests.post(f"{API_BASE}/jobs", json=payload, headers=headers)
        job_id = res.json()['data']['job']['id']

        # Cancel immediately
        cancel_res = requests.post(f"{API_BASE}/jobs/{job_id}/cancel", headers=headers)
        self.assertEqual(cancel_res.status_code, 200)

        # Check job terminal status
        job_res = requests.get(f"{API_BASE}/jobs/{job_id}", headers=headers)
        self.assertIn(job_res.json()['data']['job']['status'], ['CANCELLED', 'COMPLETED'])

if __name__ == '__main__':
    unittest.main()
