-- ==============================================================================
-- Distributed AI/ML Job Processing Platform
-- Migration 001: Initial Core Schema
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'standard_user' CHECK (role IN ('admin', 'standard_user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Workers Table
CREATE TABLE IF NOT EXISTS workers (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    hostname VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'BUSY', 'DRAINING', 'STOPPED')),
    max_concurrency INTEGER NOT NULL DEFAULT 4 CHECK (max_concurrency > 0),
    cpu_cores INTEGER NOT NULL DEFAULT 4,
    total_ram_mb INTEGER NOT NULL DEFAULT 8192,
    has_gpu BOOLEAN NOT NULL DEFAULT FALSE,
    gpu_name VARCHAR(255),
    supported_job_types JSONB NOT NULL DEFAULT '["csv_batch_inference", "data_preprocessing", "model_evaluation", "model_training", "image_classification"]'::jsonb,
    drain_mode BOOLEAN NOT NULL DEFAULT FALSE,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Jobs Table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('csv_batch_inference', 'data_preprocessing', 'model_evaluation', 'model_training', 'image_classification')),
    status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
        'SUBMITTED', 'VALIDATING', 'QUEUED', 'SCHEDULED', 'RUNNING', 
        'RETRYING', 'AGGREGATING', 'COMPLETED', 'FAILED', 
        'CANCEL_REQUESTED', 'CANCELLED', 'TIMED_OUT'
    )),
    scheduling_strategy VARCHAR(50) NOT NULL DEFAULT 'resource_aware' CHECK (scheduling_strategy IN ('round_robin', 'least_loaded', 'resource_aware', 'predictive')),
    priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    dataset_path TEXT,
    result_path TEXT,
    max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    timeout_seconds INTEGER NOT NULL DEFAULT 600 CHECK (timeout_seconds > 0),
    parameters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_batches INTEGER NOT NULL DEFAULT 1,
    completed_batches INTEGER NOT NULL DEFAULT 0,
    failed_batches INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Job Batches Table
CREATE TABLE IF NOT EXISTS job_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    batch_index INTEGER NOT NULL,
    total_batches INTEGER NOT NULL,
    record_start_index INTEGER NOT NULL DEFAULT 0,
    record_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
    chunk_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_job_batch_index UNIQUE(job_id, batch_index)
);

-- 6. Job Tasks Table
CREATE TABLE IF NOT EXISTS job_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES job_batches(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT')),
    assigned_worker_id VARCHAR(100) REFERENCES workers(id) ON DELETE SET NULL,
    lease_expires_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0,
    input_data_path TEXT,
    output_data_path TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Task Attempts Table
CREATE TABLE IF NOT EXISTS task_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES job_tasks(id) ON DELETE CASCADE,
    worker_id VARCHAR(100) REFERENCES workers(id) ON DELETE SET NULL,
    attempt_number INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    execution_time_ms BIGINT,
    cpu_percent NUMERIC(5, 2),
    memory_mb NUMERIC(8, 2),
    error_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_task_attempt UNIQUE(task_id, attempt_number)
);

-- 8. Worker Heartbeats Table
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    worker_id VARCHAR(100) NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    cpu_utilization NUMERIC(5, 2) NOT NULL,
    memory_utilization_mb NUMERIC(8, 2) NOT NULL,
    active_tasks INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Scheduling Decisions Table
CREATE TABLE IF NOT EXISTS scheduling_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    task_id UUID REFERENCES job_tasks(id) ON DELETE SET NULL,
    strategy_used VARCHAR(50) NOT NULL,
    candidate_workers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    selected_worker_id VARCHAR(100) REFERENCES workers(id) ON DELETE SET NULL,
    predicted_exec_time_ms BIGINT,
    decision_reason TEXT NOT NULL,
    scheduling_latency_ms NUMERIC(8, 3) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Job State Transitions Table
CREATE TABLE IF NOT EXISTS job_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    from_status VARCHAR(30) NOT NULL,
    to_status VARCHAR(30) NOT NULL,
    trigger_event VARCHAR(100) NOT NULL,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. Result Artifacts Table
CREATE TABLE IF NOT EXISTS result_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    artifact_name VARCHAR(255) NOT NULL,
    artifact_type VARCHAR(50) NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    checksum_sha256 VARCHAR(64),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. Model Registry Table
CREATE TABLE IF NOT EXISTS model_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    model_path TEXT NOT NULL,
    input_features_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_entity VARCHAR(50) NOT NULL,
    target_id VARCHAR(100),
    ip_address VARCHAR(45),
    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- Indexes for Performance & Query Optimization
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_tasks_job_id ON job_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_job_tasks_status ON job_tasks(status);
CREATE INDEX IF NOT EXISTS idx_job_tasks_worker ON job_tasks(assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_job_batches_job_id ON job_batches(job_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_worker ON worker_heartbeats(worker_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scheduling_decisions_job ON scheduling_decisions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_state_transitions_job ON job_state_transitions(job_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_result_artifacts_job ON result_artifacts(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
