@echo off
setlocal
cd /d "%~dp0"
title Maintenance Records - Stop

echo ============================================
echo    Maintenance Records - Stop
echo ============================================
echo.
echo Stopping background services ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"

echo.
pause
