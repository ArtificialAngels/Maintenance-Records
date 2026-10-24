@echo off
chcp 936 >nul 2>&1
setlocal
cd /d "%~dp0"
title 安装便携 Node - Maintenance Records

echo ============================================
echo   维修记录系统 - 安装便携 Node 运行时
echo ============================================
echo.
echo 将下载便携 Node（约 90MB）和 pnpm 到 node-runtime\
echo 该目录不会提交到 git，仅保存在本机。
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-runtime.ps1"
if errorlevel 1 (
  echo.
  echo [错误] 便携运行时下载失败，请检查网络后重试。
  pause
  exit /b 1
)

echo.
echo 完成。接下来：
echo   - 若 node_modules 缺失，请运行「安装依赖.bat」
echo   - 运行「启动.bat」启动系统
echo.
pause
exit /b 0