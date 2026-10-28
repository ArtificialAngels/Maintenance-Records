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
title Maintenance Records Launcher

echo ============================================
echo    维修记录系统 - 后台启动（便携 Node）
echo ============================================
echo.

REM 优先使用项目内置的便携 Node，缺失时回退到系统 Node
set "PORTABLE_NODE=%ROOT%\node-runtime\win-x64\node.exe"
if exist "%PORTABLE_NODE%" (
  echo 使用内置便携 Node：node-runtime\win-x64\node.exe
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [错误] 未找到 Node.js。
    echo        请先运行「安装便携Node.bat」下载便携 Node，
    echo        或从 https://nodejs.org/ 安装 Node.js 20+
    echo.
    pause
    exit /b 1
  )
  echo 使用系统 Node.js（未找到便携运行时）。
)

if not exist "node_modules\vite\bin\vite.js" (
  echo [错误] node_modules 不完整，请先运行「安装依赖.bat」。
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $r=$c.BeginConnect('127.0.0.1',5173,$null,$null); if ($r.AsyncWaitHandle.WaitOne(500)) { $c.EndConnect($r); exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  echo 服务已在运行，正在打开浏览器 ...
  powershell -NoProfile -Command "Start-Process 'http://127.0.0.1:5173/'"
  timeout /t 3 >nul
  exit /b 0
)

echo 正在后台启动前后端（不弹出服务窗口）...
echo 日志：.run\logs\    停止：stop.bat
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%ROOT%\scripts\start.ps1'"

echo.
echo 浏览器将自动打开：http://127.0.0.1:5173/
timeout /t 3 >nul
exit /b 0