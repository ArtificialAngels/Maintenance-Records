@echo off
setlocal
cd /d "%~dp0"
title Maintenance Records Launcher

echo ============================================
echo    Maintenance Records - Start (background)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js 20+ from:
  echo         https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo [ERROR] node_modules is incomplete. Run "pnpm install" in this folder first.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo Services are already running. Opening the browser ...
  powershell -NoProfile -Command "Start-Process 'http://127.0.0.1:5173/'"
  timeout /t 3 >nul
  exit /b 0
)

echo Starting backend and frontend in the background (no service windows) ...
echo Logs: .run\logs\    Stop: stop.bat
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0scripts\start.ps1'"

echo.
echo The browser will open automatically at http://127.0.0.1:5173/
timeout /t 3 >nul
exit /b 0
