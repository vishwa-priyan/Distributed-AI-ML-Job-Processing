#!/usr/bin/env bash
# ==============================================================================
# Linux / macOS Cluster Launcher
# ==============================================================================
set -e

echo "Starting Redis..."
redis-server --daemonize yes 2>/dev/null || true

echo "Starting Scheduler..."
python3 scheduler/app/main.py &

echo "Starting Workers..."
python3 workers/app/worker_service.py worker-cpu-01 Node-Worker-Alpha &
python3 workers/app/worker_service.py worker-cpu-02 Node-Worker-Beta &

echo "Starting Backend..."
cd backend && npm start &
cd ..

echo "Starting Frontend..."
cd frontend && npm run dev &
cd ..

echo "[OK] Cluster services launched."
wait
