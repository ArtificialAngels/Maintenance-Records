@echo off
chcp 936 >nul 2>&1
setlocal
cd /d "%~dp0"
title 维修记录系统 - 卸载 Windows 服务

echo ============================================
echo    维修记录系统 - 卸载 Windows 服务
echo ============================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo 需要管理员权限，正在请求 UAC 提升...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-service.ps1"
echo.
pause