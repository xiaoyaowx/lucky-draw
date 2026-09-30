@echo off
REM ============================================================
REM  Lucky Draw - one-click START (development mode, hot reload)
REM  Same as start.bat but skips the production build, so code
REM  changes take effect without rebuilding.
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" start -Mode dev

echo.
pause
endlocal
