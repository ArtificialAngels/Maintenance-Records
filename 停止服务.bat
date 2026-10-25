@echo off
chcp 936 >nul 2>&1
setlocal
cd /d "%~dp0"
title 维修记录系统 - 停止生产服务

echo ============================================
echo    维修记录系统 - 停止生产服务
echo ============================================
echo.
echo 正在停止生产服务 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-prod.ps1"
echo.
pause