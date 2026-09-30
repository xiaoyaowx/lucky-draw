@echo off
REM ============================================================
REM  Lucky Draw - one-click STOP
REM  Kills the whole process tree (npm -> node -> tsx -> server),
REM  so no orphan process keeps holding the port.
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" stop

echo.
pause
endlocal
