@echo off
setlocal
cd /d "%~dp0"
title Maintenance Records Launcher

echo ============================================
echo    Maintenance Records - Launch
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

echo [1/2] Starting backend (Fastify) : http://127.0.0.1:8787
start "MR-Server :8787" /D "%~dp0apps\server" cmd /k node "%~dp0node_modules\tsx\dist\cli.mjs" watch src/index.ts

echo [2/2] Starting frontend (Vite)  : http://127.0.0.1:5173
start "MR-Web :5173" /D "%~dp0apps\web" cmd /k node "%~dp0node_modules\vite\bin\vite.js"

echo.
echo Waiting for the frontend, the browser will open automatically ...
echo Tip: close the two service windows to stop the application.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=0;$i -lt 30;$i++){try{Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 1 ^| Out-Null; break}catch{Start-Sleep -Seconds 1}}; Start-Process 'http://127.0.0.1:5173/'"

echo.
echo All services started. You can close this window.
pause
endlocal
