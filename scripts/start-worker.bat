@echo off
TITLE Distributed AI/ML Remote Worker Launcher
echo ======================================================================
echo  Distributed AI/ML Remote Worker Launcher
echo ======================================================================
set /p MASTER_IP="Enter Machine 1 (Master) IP Address [e.g. 192.168.1.50]: "

if "%MASTER_IP%"=="" (
    echo Error: Master IP cannot be empty.
    pause
    exit /b 1
)

set WORKER_ID=worker-remote-01
set WORKER_NAME=Remote-Worker-Node

powershell -ExecutionPolicy Bypass -File "%~dp0start-worker.ps1" -MasterIP "%MASTER_IP%" -WorkerId "%WORKER_ID%" -WorkerName "%WORKER_NAME%"
pause

