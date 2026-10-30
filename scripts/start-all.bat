@echo off
TITLE Distributed AI/ML Platform Cluster Launcher
echo ======================================================================
echo Starting Distributed AI/ML Processing Cluster
echo ======================================================================

powershell -ExecutionPolicy Bypass -File "%~dp0start-all.ps1"
pause
