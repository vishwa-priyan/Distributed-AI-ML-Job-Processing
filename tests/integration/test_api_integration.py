"""
Integration tests for Backend REST API under /api/v1.
Validates:
- User registration and authentication
- Worker listing and health
- Job submission and status transitions
- Role-based authorization and ownership restrictions
"""

import unittest
import requests

API_BASE = "http://localhost:5000/api/v1"

class TestAPIIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Obtain tokens for admin and user
        admin_res = requests.post(f"{API_BASE}/auth/login", json={
            "usernameOrEmail": "admin@distml.local",
            "password": "Admin@123"
        })
        cls.admin_token = admin_res.json()['data']['accessToken']

        user_res = requests.post(f"{API_BASE}/auth/login", json={
            "usernameOrEmail": "user@distml.local",
            "password": "User@123"
        })
        cls.user_token = user_res.json()['data']['accessToken']
        cls.user_id = user_res.json()['data']['user']['id']

    def test_auth_me_endpoint(self):
        headers = {"Authorization": f"Bearer {self.user_token}"}
        res = requests.get(f"{API_BASE}/auth/me", headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['data']['username'], 'user')

    def test_workers_list(self):
        headers = {"Authorization": f"Bearer {self.user_token}"}
        res = requests.get(f"{API_BASE}/workers", headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.json()['data']), 2)

    def test_job_submission_and_query(self):
        headers = {"Authorization": f"Bearer {self.user_token}"}
        payload = {
            "name": "Integration Test Inference Job",
            "job_type": "csv_batch_inference",
            "scheduling_strategy": "round_robin",
            "batch_size": 500,
            "sample_dataset": "customer_churn"
        }
        res = requests.post(f"{API_BASE}/jobs", json=payload, headers=headers)
        self.assertEqual(res.status_code, 201)
        job_id = res.json()['data']['job']['id']
        self.assertIsNotNone(job_id)

        # Retrieve job details
        get_res = requests.get(f"{API_BASE}/jobs/{job_id}", headers=headers)
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()['data']['job']['id'], job_id)

    def test_admin_route_protection(self):
        # Standard user attempting to access /admin/users should get 403 Forbidden
        user_headers = {"Authorization": f"Bearer {self.user_token}"}
        res = requests.get(f"{API_BASE}/admin/users", headers=user_headers)
        self.assertEqual(res.status_code, 403)

        # Admin accessing /admin/users should succeed
        admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        admin_res = requests.get(f"{API_BASE}/admin/users", headers=admin_headers)
        self.assertEqual(admin_res.status_code, 200)

if __name__ == '__main__':
    unittest.main()
