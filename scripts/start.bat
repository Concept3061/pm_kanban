@echo off
cd /d "%~dp0.."
docker compose up --build -d || exit /b 1
if "%PORT%"=="" (echo Running at http://localhost:8000) else (echo Running at http://localhost:%PORT%)
