# ==============================================================================
# Distributed AI/ML Job Processing Platform - Local Dev Cluster Stopper (Windows)
# ==============================================================================

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Stopping Distributed AI/ML Processing Cluster Services...            " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Terminate processes listening on cluster ports
$ports = @(5000, 5173, 6379, 8000)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($pidToKill in $pids) {
            Write-Host "Stopping process PID $pidToKill on port $port..." -ForegroundColor Yellow
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        }
    }
}

# 2. Terminate background Python worker services
Get-CimInstance Win32_Process -Filter "name = 'python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { 
        $_.CommandLine -like "*worker_service.py*" -or 
        $_.CommandLine -like "*run_redis.py*" -or 
        $_.CommandLine -like "*scheduler/app/main.py*" 
    } |
    ForEach-Object {
        Write-Host "Stopping cluster Python process PID $($_.ProcessId)..." -ForegroundColor Yellow
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " [OK] All cluster services stopped cleanly.                           " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green

