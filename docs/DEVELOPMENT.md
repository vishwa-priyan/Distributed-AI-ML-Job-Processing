# Local Development Guide

## 1. Directory Structure

```
distributed-ml-platform/
|-- backend/          # Node.js / Express / TypeScript REST API (:5000)
|-- frontend/         # React / Vite / Tailwind CSS Dashboard (:5173)
|-- scheduler/        # Python FastAPI / Uvicorn Scheduler (:8000)
|-- workers/          # Python Independent Worker Services & ML Handlers
|-- ml/               # Sample datasets, pre-trained models, predictor pipeline
|-- database/         # PostgreSQL migrations and seed scripts
|-- monitoring/       # Prometheus & Grafana definitions
|-- tests/            # Unit, integration, reliability test suites
|-- scripts/          # Cluster startup and benchmarking utilities
|-- docs/             # Technical deep dives
|-- docker-compose.yml# Production container orchestration
|-- .env.example      # Environment variables schema
`-- README.md         # Master project documentation
```

---

## 2. Running Individual Services for Development

### Terminal 1: Local Redis
```bash
python scripts/run_redis.py
```

### Terminal 2: Scheduler Service
```bash
python scheduler/app/main.py
```

### Terminal 3: Worker Alpha
```bash
python workers/app/worker_service.py worker-cpu-01 Node-Worker-Alpha
```

### Terminal 4: Worker Beta
```bash
python workers/app/worker_service.py worker-cpu-02 Node-Worker-Beta
```

### Terminal 5: Backend API
```bash
cd backend
npm run dev
```

### Terminal 6: Frontend Dashboard
```bash
cd frontend
npm run dev
```

Or execute `.\scripts\start-all.ps1` to start all components simultaneously.
