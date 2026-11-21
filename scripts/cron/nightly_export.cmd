@echo off
rem Script nocturno de telemetria (DEV-53) para el Programador de tareas de Windows.
rem Se ejecuta desde la raiz del monorepo y anade la salida a logs\nightly_export.log
cd /d "%~dp0..\.."
if not exist logs mkdir logs
uv run --project services/api python scripts\nightly_export.py >> logs\nightly_export.log 2>&1
