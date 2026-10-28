@echo off
chcp 936 >nul 2>&1
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
title 维修记录系统 - 停止生产服务

echo ============================================
echo    维修记录系统 - 停止生产服务
echo ============================================
echo.
echo 正在停止生产服务 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\stop-prod.ps1"
echo.
pause