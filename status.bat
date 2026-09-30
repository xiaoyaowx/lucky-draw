@echo off
REM ============================================================
REM  Lucky Draw - show service status (running / stopped, port, PID)
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" status

echo.
pause
endlocal
