"""
Pluggable Scheduling Strategies for Distributed AI/ML Workloads.
Strategies:
1. RoundRobinStrategy
2. LeastLoadedStrategy
3. ResourceAwareStrategy
4. PredictiveStrategy (with deterministic fallback)
"""

import os
import time
import json
import logging
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("SchedulerStrategies")

class SchedulingStrategy:
    def select_worker(
        self, 
        task: Dict[str, Any], 
        candidates: List[Dict[str, Any]], 
        worker_telemetry: Dict[str, Dict[str, Any]]
    ) -> Tuple[Optional[Dict[str, Any]], str, Optional[int]]:
        """
        Returns: (selected_worker, reason, predicted_exec_time_ms)
        """
        raise NotImplementedError

class RoundRobinStrategy(SchedulingStrategy):
    def __init__(self):
        self._index = 0

    def select_worker(self, task, candidates, worker_telemetry):
        if not candidates:
            return None, "No eligible candidate workers available", None
        
        selected = candidates[self._index % len(candidates)]
        self._index += 1
        reason = f"RoundRobin cyclical assignment (index {self._index - 1} of {len(candidates)} workers)"
        return selected, reason, None

class LeastLoadedStrategy(SchedulingStrategy):
    def select_worker(self, task, candidates, worker_telemetry):
        if not candidates:
            return None, "No eligible candidate workers available", None

        # Sort by active tasks reported in telemetry or worker state
        scored = []
        for worker in candidates:
            w_id = worker['id']
            telemetry = worker_telemetry.get(w_id, {})
            active_tasks = int(telemetry.get('active_tasks', 0))
            scored.append((active_tasks, worker))

        scored.sort(key=lambda x: x[0])
        best_active_tasks, selected = scored[0]
        reason = f"LeastLoaded chosen with {best_active_tasks} currently active tasks"
        return selected, reason, None

class ResourceAwareStrategy(SchedulingStrategy):
    def select_worker(self, task, candidates, worker_telemetry):
        if not candidates:
            return None, "No eligible candidate workers available", None

        # Multi-factor resource evaluation:
        # Score = (CPU_utilization * 0.4) + (Memory_utilization_ratio * 0.3) + (concurrency_ratio * 0.3)
        # Lower score = better candidate
        scored = []
        for worker in candidates:
            w_id = worker['id']
            telemetry = worker_telemetry.get(w_id, {})
            
            cpu_pct = float(telemetry.get('cpu_percent', 50.0))
            avail_ram = float(telemetry.get('available_ram_mb', 2048.0))
            total_ram = float(worker.get('total_ram_mb', 8192.0))
            active_tasks = int(telemetry.get('active_tasks', 0))
            max_concurrency = int(worker.get('max_concurrency', 4))

            # Disqualify if worker is at or over capacity
            if active_tasks >= max_concurrency:
                continue

            mem_ratio = (1.0 - (avail_ram / max(total_ram, 1024.0))) * 100.0
            concurrency_ratio = (active_tasks / max_concurrency) * 100.0

            # Composite Resource Pressure Score (0-100)
            composite_score = (cpu_pct * 0.4) + (mem_ratio * 0.3) + (concurrency_ratio * 0.3)
            
            # Bonus for GPU if task requires GPU
            task_type = task.get('task_type', '')
            if 'image' in task_type and worker.get('has_gpu'):
                composite_score -= 20.0 # Prioritize GPU worker

            scored.append((composite_score, worker, cpu_pct, avail_ram, active_tasks))

        if not scored:
            return None, "All candidate workers are at maximum concurrency capacity", None

        scored.sort(key=lambda x: x[0])
        best_score, selected, cpu_pct, avail_ram, active_tasks = scored[0]
        reason = (
            f"ResourceAware selected worker {selected['id']} (Score: {best_score:.1f}, "
            f"CPU: {cpu_pct:.1f}%, Avail RAM: {avail_ram:.0f}MB, Slots: {active_tasks}/{selected.get('max_concurrency', 4)})"
        )
        return selected, reason, None

class PredictiveStrategy(SchedulingStrategy):
    def __init__(self, model_path: str = "ml/models/job_runtime_predictor.joblib"):
        self.model_path = model_path
        self._predictor = None
        self._fallback_strategy = ResourceAwareStrategy()
        self._load_model()

    def _load_model(self):
        if os.path.exists(self.model_path):
            try:
                import joblib
                self._predictor = joblib.load(self.model_path)
                logger.info(f"Loaded predictive scheduling model from {self.model_path}")
            except Exception as e:
                logger.warning(f"Could not load predictive model: {e}")
                self._predictor = None

    def select_worker(self, task, candidates, worker_telemetry):
        if not self._predictor:
            # Safe deterministic fallback
            selected, reason, _ = self._fallback_strategy.select_worker(task, candidates, worker_telemetry)
            return selected, f"Predictive model unavailable; fallback to ResourceAware: {reason}", None

        # Predict total completion time = Queue Waiting Time + Predicted Execution Time
        scored = []
        task_type_map = {
            'csv_batch_inference': 1,
            'data_preprocessing': 2,
            'model_evaluation': 3,
            'model_training': 4,
            'image_classification': 5
        }
        type_code = task_type_map.get(task.get('task_type', ''), 1)
        record_count = task.get('record_count', 500)
        batch_size = task.get('parameters', {}).get('batch_size', 500)

        for worker in candidates:
            w_id = worker['id']
            telemetry = worker_telemetry.get(w_id, {})
            active_tasks = int(telemetry.get('active_tasks', 0))
            cpu_cores = int(worker.get('cpu_cores', 4))
            total_ram = float(worker.get('total_ram_mb', 8192.0))
            cpu_pct = float(telemetry.get('cpu_percent', 30.0))

            try:
                # Features: [job_type_code, record_count, batch_size, cpu_cores, total_ram, active_tasks, cpu_pct]
                features = [[type_code, record_count, batch_size, cpu_cores, total_ram, active_tasks, cpu_pct]]
                pred_exec_sec = float(self._predictor.predict(features)[0])
                pred_exec_sec = max(0.5, pred_exec_sec)

                # Queue wait estimate: active_tasks * avg_task_duration
                queue_wait_sec = active_tasks * (pred_exec_sec * 0.7)
                total_time_sec = queue_wait_sec + pred_exec_sec
                pred_exec_ms = int(pred_exec_sec * 1000)

                scored.append((total_time_sec, pred_exec_ms, worker))
            except Exception as pe:
                logger.warning(f"Prediction failed for worker {w_id}: {pe}")
                # Fallback on single worker scoring
                scored.append((active_tasks * 5.0 + 2.0, 2000, worker))

        if not scored:
            return self._fallback_strategy.select_worker(task, candidates, worker_telemetry)

        scored.sort(key=lambda x: x[0])
        best_total_sec, best_exec_ms, selected = scored[0]
        reason = (
            f"Predictive model estimated fastest completion ({best_total_sec:.2f}s total: "
            f"{best_exec_ms}ms execution + queue wait on {selected['id']})"
        )
        return selected, reason, best_exec_ms
