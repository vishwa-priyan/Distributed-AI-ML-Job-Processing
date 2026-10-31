param (
    [Parameter(Mandatory=$true, HelpMessage="Enter the IP address of Machine 1 (Master)")]
    [string]$MasterIP,
    [string]$WorkerId = "worker-remote-01",
    [string]$WorkerName = "Remote-Worker-Node"
)

# Ensure execution from project root
if ($PSScriptRoot) {
    Set-Location (Split-Path -Parent $PSScriptRoot)
}

$env:DATABASE_URL = "postgresql://postgres:1234@$($MasterIP):5432/distributed_ml"
$env:REDIS_URL = "redis://$($MasterIP):6379/0"
$env:MASTER_HOST = "$MasterIP"
$env:MASTER_API_PORT = "5000"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Starting Remote Distributed Worker Node: $WorkerName" -ForegroundColor Cyan
Write-Host " Connecting to Master at $MasterIP..." -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

python workers/app/worker_service.py $WorkerId $WorkerName

