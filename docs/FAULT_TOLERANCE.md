# Fault Tolerance & Recovery Architecture

## 1. Guarantees and Principles
The platform guarantees **at-least-once task delivery** combined with **idempotent execution and atomic result commits**.

---

## 2. Recovery Mechanics

### A. Worker Heartbeat Reaper
- Each worker node runs a background telemetry loop sending heartbeats every 5 seconds.
- The scheduler runs a reaper loop every 5 seconds.
- If `CURRENT_TIMESTAMP - last_heartbeat_at > 25 seconds`, the worker is marked `OFFLINE`.

### B. Orphaned Task Recovery
When a worker becomes `OFFLINE`:
1. The scheduler queries all tasks where `assigned_worker_id = dead_worker_id` and `status IN ('SCHEDULED', 'RUNNING')`.
2. The scheduler verifies that the task lease has expired.
3. The tasks are reset to `QUEUED` with `assigned_worker_id = NULL`.
4. Healthy workers pick up the re-queued tasks in the next scheduling cycle.

### C. Exponential Backoff with Jitter
Failed task attempts trigger backoff before retry:
$$t_{\text{backoff}} = \min(t_{\text{max}}, t_{\text{base}} \times 2^{\text{attempt}}) \pm \text{jitter}$$
- Jitter prevents "thundering herd" problems on database or storage.
- Max retries default to 3 (configurable by admin).
- When retries are exhausted, the task and overall job are marked `FAILED`.

### D. Idempotent Atomic Commits
- Output batch chunks are initially written to a process-unique temporary path: `{target_path}.tmp.{pid}`.
- Upon successful file flush, an atomic OS-level filesystem rename is executed.
- SHA-256 checksums are calculated and stored in `result_artifacts`.
- Re-executed tasks overwrite previous temporary artifacts cleanly without partial corruptions.
