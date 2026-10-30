# Database Schema & Relational Modeling

## 1. Schema Principles
- PostgreSQL 16/18 with relational integrity and foreign keys.
- UUID primary keys for distributed scaling without ID exhaustion or collision.
- JSONB columns strictly reserved for flexible hyperparameters and telemetry metadata.
- UTC timestamps with timezone (`TIMESTAMPTZ`) across all tables.

---

## 2. Table Catalog

| Table | Description | Important Indexes |
| :--- | :--- | :--- |
| `users` | Authenticated users (admin & standard_user) | `username` (UNIQUE), `email` (UNIQUE) |
| `refresh_tokens` | Hashed refresh tokens for JWT rotation | `token_hash` (UNIQUE), `user_id` (FK) |
| `workers` | Registered worker processes & node identities | `id` (PK), `status`, `last_heartbeat_at` |
| `worker_heartbeats`| Historical telemetry samples from `psutil` | `worker_id`, `timestamp` (DESC) |
| `jobs` | Authoritative workload records and aggregate state | `user_id`, `status`, `created_at` (DESC) |
| `job_batches` | Partitioned dataset chunks | `job_id`, `batch_index` (UNIQUE) |
| `job_tasks` | Individual executable units assigned to workers | `job_id`, `status`, `assigned_worker_id` |
| `task_attempts` | Execution attempts, CPU, RAM, and error details | `task_id`, `attempt_number` (UNIQUE) |
| `scheduling_decisions`| Auditable log of worker evaluation & selection reason | `job_id`, `created_at` |
| `job_state_transitions`| State transition history audit log | `job_id`, `created_at` (ASC) |
| `result_artifacts` | Stored predictions, models, metrics & SHA-256 | `job_id`, `checksum_sha256` |
| `model_registry` | Allowlisted pre-trained models | `id` (PK), `is_active` |
| `audit_logs` | Administrative security events audit trail | `user_id`, `created_at` (DESC) |

---

## 3. Migration Instructions
Migrations reside in `database/migrations/`:
- To apply migration:
  ```bash
  psql -U postgres -d distributed_ml -f database/migrations/001_initial_schema.sql
  ```
- To seed initial models and default users:
  ```bash
  psql -U postgres -d distributed_ml -f database/seed/seed_data.sql
  ```
