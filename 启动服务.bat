@echo off
chcp 936 >nul 2>&1
setlocal
cd /d "%~dp0"
title 维修记录系统 - 生产启动

set "PORT=80"
if not "%~1"=="" set "PORT=%~1"

echo ============================================
echo    维修记录系统 - 生产启动（单进程）
echo ============================================
echo.

REM 监听 80 端口需要管理员权限，自动请求 UAC 提升
if "%PORT%"=="80" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo 监听 80 端口需要管理员权限，正在请求 UAC 提升...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%PORT%' -Verb RunAs"
    exit /b 0
  )
)

if not exist "%~dp0node-runtime\win-x64\node.exe" (
  echo [错误] 未找到便携 Node，请先运行「安装便携Node.bat」。
  pause
  exit /b 1
)

echo 正在构建并启动生产服务（首次构建较慢，稍候会自动打开浏览器）...
echo 日志：.run\logs\prod.*.log    停止：停止服务.bat
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-prod.ps1" -Port %PORT%
echo.
pause