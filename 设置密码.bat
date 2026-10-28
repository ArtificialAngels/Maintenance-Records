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
title 维修记录系统 - 设置密码

echo ============================================
echo    维修记录系统 - 设置密码
echo ============================================
echo.

REM 便携 Node 优先，缺失时回退系统 Node
set "NODE=%ROOT%\node-runtime\win-x64\node.exe"
if not exist "%NODE%" set "NODE=node"

REM 已构建（发布包 / 开发目录构建过）：直接运行编译好的 CLI，无需 pnpm / tsx
REM 发布包是单文件 bundle（.cjs），开发目录是 tsc 产物（.js）
set "SETPW=dist\cli\set-password.js"
if exist "%ROOT%\apps\server\dist\cli\set-password.cjs" set "SETPW=dist\cli\set-password.cjs"
if exist "%ROOT%\apps\server\%SETPW%" goto :built

echo [提示] 未找到已构建的 dist，回退到 pnpm + tsx 开发模式。
set "PNPM=%ROOT%\node-runtime\tools\pnpm.exe"
if not exist "%PNPM%" (
  echo [错误] 未找到 pnpm，也没有已构建的 dist。
  echo        请先运行「安装便携Node.bat」和「安装依赖.bat」，再运行「启动服务.bat」完成构建。
  pause
  exit /b 1
)

set /p UID=请输入要修改的账号 ID（如 u_admin）:
if "%UID%"=="" ( echo 已取消 & pause & exit /b 1 )
echo （输入新密码时不会明文回显）
chcp 65001 >nul 2>&1
"%PNPM%" --dir "%ROOT%\apps\server" run set-password %UID%
chcp 936 >nul 2>&1
echo.
pause
exit /b 0

:built
set /p UID=请输入要修改的账号 ID（如 u_admin）:
if "%UID%"=="" ( echo 已取消 & pause & exit /b 1 )
echo （输入密码时可能不回显，按回车确认）
cd /d "%ROOT%\apps\server"
chcp 65001 >nul 2>&1
"%NODE%" "%SETPW%" %UID%
chcp 936 >nul 2>&1
cd /d "%ROOT%"
echo.
pause