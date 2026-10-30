# Multi-Node Deployment & Production Guide

## 1. Single-Machine Deployment (Windows / Linux)
In local development mode:
- PostgreSQL runs natively or in Docker.
- Redis runs via standalone Python server (`scripts/run_redis.py`) or Redis service.
- Python workers run as separate operating system processes with unique identities:
  ```bash
  python workers/app/worker_service.py worker-cpu-01 Node-Worker-Alpha
  python workers/app/worker_service.py worker-cpu-02 Node-Worker-Beta
  ```

---

## 2. Multi-Node Physical / Cloud Cluster Deployment

In a multi-node production deployment across distinct physical or virtual machines:

```
[Node 0: Master Control Plane]
- PostgreSQL 16 (Private subnet, port 5432)
- Redis 7 (Private subnet, port 6379)
- Node.js API Service (:5000)
- Python Scheduler Service (:8000)
- Prometheus & Grafana

[Node 1: Compute Worker 1 (192.168.1.101)]
- Python Worker Process (worker-node-1)
- psutil telemetry reports local Node 1 hardware
- Connects to Master: REDIS_URL=redis://192.168.1.100:6379/0, DATABASE_URL=postgresql://...

[Node 2: GPU Compute Worker 2 (192.168.1.102)]
- Python Worker Process (worker-gpu-01)
- CUDA / GPU capabilities enabled
- Connects to Master: REDIS_URL=redis://192.168.1.100:6379/0, DATABASE_URL=postgresql://...
```

---

## 3. Docker Compose Stack
Launch all services on a single host with Docker:
```bash
docker compose up -d --build
```
Verify container health:
```bash
docker compose ps
```
Scale worker processes:
```bash
docker compose up -d --scale worker-alpha=3
```
