"""
Unit tests for Intelligent Scheduling Strategies.
Validates:
- Round-Robin cyclical rotation
- Least-Loaded workload assignment
- Resource-Aware capacity & vector scoring
- Predictive ML scheduling & deterministic fallback
"""

import unittest
from scheduler.app.policies.strategies import (
    RoundRobinStrategy,
    LeastLoadedStrategy,
    ResourceAwareStrategy,
    PredictiveStrategy
)

class TestSchedulingStrategies(unittest.TestCase):
    def setUp(self):
        self.workers = [
            {"id": "worker-1", "name": "Node-1", "max_concurrency": 4, "cpu_cores": 8, "total_ram_mb": 16384, "has_gpu": False},
            {"id": "worker-2", "name": "Node-2", "max_concurrency": 4, "cpu_cores": 4, "total_ram_mb": 8192, "has_gpu": True}
        ]
        self.telemetry = {
            "worker-1": {"cpu_percent": 20.0, "available_ram_mb": 12000.0, "active_tasks": 1},
            "worker-2": {"cpu_percent": 80.0, "available_ram_mb": 1024.0, "active_tasks": 3}
        }
        self.task = {
            "id": "test-task-1",
            "task_type": "csv_batch_inference",
            "record_count": 500,
            "parameters": {"batch_size": 500}
        }

    def test_round_robin_rotation(self):
        strategy = RoundRobinStrategy()
        w1, _, _ = strategy.select_worker(self.task, self.workers, self.telemetry)
        w2, _, _ = strategy.select_worker(self.task, self.workers, self.telemetry)
        w3, _, _ = strategy.select_worker(self.task, self.workers, self.telemetry)

        self.assertEqual(w1['id'], 'worker-1')
        self.assertEqual(w2['id'], 'worker-2')
        self.assertEqual(w3['id'], 'worker-1')

    def test_least_loaded_selection(self):
        strategy = LeastLoadedStrategy()
        selected, reason, _ = strategy.select_worker(self.task, self.workers, self.telemetry)
        # worker-1 has 1 active task vs worker-2 with 3 active tasks
        self.assertEqual(selected['id'], 'worker-1')
        self.assertIn("LeastLoaded chosen with 1 currently active tasks", reason)

    def test_resource_aware_selection(self):
        strategy = ResourceAwareStrategy()
        selected, reason, _ = strategy.select_worker(self.task, self.workers, self.telemetry)
        # worker-1 has low CPU (20%) and high available RAM (12GB) -> should win over worker-2 (80% CPU)
        self.assertEqual(selected['id'], 'worker-1')
        self.assertIn("ResourceAware selected worker worker-1", reason)

    def test_predictive_fallback_on_missing_model(self):
        strategy = PredictiveStrategy(model_path="non_existent_model.joblib")
        selected, reason, pred_ms = strategy.select_worker(self.task, self.workers, self.telemetry)
        self.assertIsNotNone(selected)
        self.assertIn("fallback to ResourceAware", reason)

    def test_empty_candidates_rejection(self):
        strategy = ResourceAwareStrategy()
        selected, reason, _ = strategy.select_worker(self.task, [], {})
        self.assertIsNone(selected)
        self.assertIn("No eligible candidate workers available", reason)

if __name__ == '__main__':
    unittest.main()
