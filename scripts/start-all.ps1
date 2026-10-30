# ==============================================================================
# Distributed AI/ML Job Processing Platform - Local Dev Cluster Launcher (Windows)
# ==============================================================================

# Ensure script executes from project root regardless of where it is invoked
if ($PSScriptRoot) {
    Set-Location (Split-Path -Parent $PSScriptRoot)
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Starting Distributed AI/ML Processing Cluster (Windows Local Mode)   " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Start Local Redis Server
Write-Host "[1/5] Starting Redis Server..." -ForegroundColor Yellow
Start-Process python -ArgumentList "scripts/run_redis.py" -NoNewWindow
Start-Sleep -Seconds 1

# 2. Start Python Scheduler Service
Write-Host "[2/5] Starting Intelligent Scheduler Service (:8000)..." -ForegroundColor Yellow
Start-Process python -ArgumentList "scheduler/app/main.py" -NoNewWindow
Start-Sleep -Seconds 2

# 3. Start Python Worker 1 & Worker 2
Write-Host "[3/5] Starting Worker 1 (Node-Worker-Alpha) & Worker 2 (Node-Worker-Beta)..." -ForegroundColor Yellow
Start-Process python -ArgumentList "workers/app/worker_service.py worker-cpu-01 Node-Worker-Alpha" -NoNewWindow
Start-Process python -ArgumentList "workers/app/worker_service.py worker-cpu-02 Node-Worker-Beta" -NoNewWindow
Start-Sleep -Seconds 1

# 4. Start Node.js Backend API
Write-Host "[4/5] Starting Express Backend API (:5000)..." -ForegroundColor Yellow
Start-Process cmd.exe -ArgumentList "/c npm start" -WorkingDirectory "backend" -NoNewWindow
Start-Sleep -Seconds 2

# 5. Start React Vite Frontend
Write-Host "[5/5] Starting React Vite Dashboard (:5173)..." -ForegroundColor Yellow
Start-Process cmd.exe -ArgumentList "/c npm run dev" -WorkingDirectory "frontend"

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " [OK] ALL CLUSTER SERVICES RUNNING SUCCESSFULLY!                      " -ForegroundColor Green
Write-Host " Web Dashboard: http://localhost:5173                                 " -ForegroundColor Green
Write-Host " Backend API:   http://localhost:5000/api/v1                          " -ForegroundColor Green
Write-Host " Scheduler API: http://localhost:8000/health                          " -ForegroundColor Green
Write-Host " Demo Login:    admin@distml.local / Admin@123                        " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
