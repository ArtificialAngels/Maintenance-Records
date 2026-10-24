@echo off
chcp 936 >nul 2>&1
setlocal
cd /d "%~dp0"
title 安装依赖 - Maintenance Records

echo ============================================
echo   维修记录系统 - 安装依赖
echo ============================================
echo.

set "PNPM=%~dp0node-runtime\tools\pnpm.exe"
if not exist "%PNPM%" (
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo [错误] 未找到 pnpm。请先运行「安装便携Node.bat」，
    echo        或全局安装 pnpm 9。
    echo.
    pause
    exit /b 1
  )
  set "PNPM=pnpm"
)

echo 使用：%PNPM%
echo.
call "%PNPM%" install
if errorlevel 1 (
  echo.
  echo [错误] pnpm install 失败。
  pause
  exit /b 1
)

echo.
echo 依赖安装完成，运行「启动.bat」启动系统。
pause
exit /b 0