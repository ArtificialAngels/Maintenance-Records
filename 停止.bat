@echo off
setlocal
REM 共享盘部署：UNC 路径必须先映射成本地盘符（Node ESM 无法从 \\ 路径运行）
set "ROOT=%~dp0"
call "%~dp0scripts\uncroot.cmd" ROOT "%ROOT%"
if errorlevel 1 (
  echo [错误] 共享盘路径映射失败：请确认能访问该共享盘，或把项目拷贝到本机磁盘后运行。
  pause
  exit /b 1
)
cd /d "%ROOT%"
title Maintenance Records - Stop

echo ============================================
echo    Maintenance Records - Stop
echo ============================================
echo.
echo Stopping background services ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\stop.ps1"

echo.
pause
