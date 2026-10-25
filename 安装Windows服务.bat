@echo off
chcp 936 >nul 2>&1
setlocal
cd /d "%~dp0"
title 维修记录系统 - 安装 Windows 服务

echo ============================================
echo    维修记录系统 - 安装 Windows 服务（NSSM）
echo ============================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo 需要管理员权限，正在请求 UAC 提升...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

echo 前置说明：需把 nssm.exe 放到项目根目录，
echo 下载地址 https://nssm.cc/release/nssm-2.24.zip （取 win64\nssm.exe）
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-service.ps1"
echo.
pause