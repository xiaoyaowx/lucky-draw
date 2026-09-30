@echo off
REM ============================================================
REM  Lucky Draw - one-click START (production mode)
REM  Runs the server as a detached background process, so you can
REM  close this window and the service keeps running.
REM  Chinese messages come from scripts\service.ps1; this file stays
REM  ASCII-only because cmd.exe parses .bat with the console codepage
REM  and would garble UTF-8 text.
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" start -Mode prod

echo.
pause
endlocal
