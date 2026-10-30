@echo off
TITLE Stop Distributed AI/ML Platform Cluster
powershell -ExecutionPolicy Bypass -File "%~dp0stop-all.ps1"
pause

