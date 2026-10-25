@echo off
chcp 936 >nul 2>&1
setlocal
cd /d "%~dp0"
title 维修记录系统 - 设置账号密码

echo ============================================
echo    维修记录系统 - 设置账号密码
echo ============================================
echo.

set "PNPM=%~dp0node-runtime\tools\pnpm.exe"
if not exist "%PNPM%" (
  echo [错误] 未找到 pnpm，请先运行「安装便携Node.bat」。
  pause
  exit /b 1
)

set /p UID=请输入账号 ID（如 u_admin）:
if "%UID%"=="" ( echo 已取消。 & pause & exit /b 1 )
set /p PWD=请输入新密码（至少 6 位，输入时明文显示）:
if "%PWD%"=="" ( echo 已取消。 & pause & exit /b 1 )
echo.
"%PNPM%" --dir "%~dp0apps\server" run set-password %UID% %PWD%
echo.
pause