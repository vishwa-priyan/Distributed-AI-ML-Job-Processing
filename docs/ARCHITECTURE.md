# System Architecture & Service Boundaries

## 1. Architectural Philosophy
The **Distributed AI/ML Job Processing Platform** is architected as an asynchronous, event-driven, decoupled distributed system. No single point of state failure exists between the presentation layer, the API server, the scheduler, the message broker, and the worker execution tier.

Authoritative state is managed exclusively in PostgreSQL using transactional integrity. Ephemeral coordination, fast worker heartbeats, and queue dispatch are managed through Redis.

---

## 2. Component Boundaries & Interaction

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Browser
    participant API as Node.js Backend API
    participant DB as PostgreSQL 18
    participant Storage as File / Artifact Storage
    participant Sched as Python Scheduler (:8000)
    participant Redis as Redis 7 Broker
    participant Worker as Python Worker Nodes

    User->>API: POST /api/v1/jobs (Upload dataset & parameters)
    API->>Storage: Stage uploaded CSV / dataset
    API->>DB: INSERT jobs (status: VALIDATING)
    API->>Storage: Partition CSV into batch chunks
    API->>DB: INSERT job_batches & job_tasks (status: QUEUED)
    API->>DB: UPDATE jobs (status: QUEUED)
    API-->>User: Return 201 Created (Job ID & batches)

    loop Every 1 Second
        Sched->>DB: SELECT pending QUEUED tasks (Priority DESC)
        Sched->>Redis: HGETALL worker heartbeats & queue lengths
        Sched->>Sched: Evaluate Strategy (Resource-Aware / Predictive ML)
        Sched->>DB: UPDATE job_tasks (status: SCHEDULED, worker_id)
        Sched->>DB: INSERT scheduling_decisions
        Sched->>Redis: RPUSH queue:{worker_id} (Task Envelope)
    end

    loop Worker Queue Polling
        Worker->>Redis: LPOP queue:{worker_id}
        Worker->>DB: UPDATE job_tasks (status: RUNNING, lease_expires_at)
        Worker->>DB: INSERT task_attempts (status: RUNNING)
        Worker->>Storage: Read input batch chunk
        Worker->>Worker: Execute safe ML Handler with psutil telemetry
        Worker->>Storage: Write atomic output CSV & SHA-256
        Worker->>DB: UPDATE task_attempts (status: COMPLETED)
        Worker->>DB: UPDATE job_tasks (status: COMPLETED)
        opt If All Batches Complete
            Worker->>DB: Query all completed chunk outputs
            Worker->>Storage: Deterministically aggregate into final CSV
            Worker->>DB: INSERT result_artifacts
            Worker->>DB: UPDATE jobs (status: COMPLETED)
            Worker->>DB: INSERT job_state_transitions
        end
    end
```

---

## 3. Communication Protocols
- **Client to Backend**: HTTP/1.1 REST API + WebSocket (Socket.IO) for real-time progress broadcasts.
- **Backend to PostgreSQL**: Native PostgreSQL connection pool (`pg`) over TCP port 5432 with explicit transaction scopes (`BEGIN` / `COMMIT` / `ROLLBACK`).
- **Scheduler to Redis & PostgreSQL**: Direct low-latency TCP connections for task polling and telemetry caching.
- **Workers to Compute & Broker**: Task queues isolated via `queue:{worker_id}`. Real-time telemetry published to `worker:{worker_id}:heartbeat` with 20-second TTLs.
