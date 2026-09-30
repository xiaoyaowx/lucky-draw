@echo off
REM ============================================================
REM  Lucky Draw - one-click RESTART
REM  Keeps whichever mode (prod / dev) was running before.
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" restart

echo.
pause
endlocal
