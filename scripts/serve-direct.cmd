@echo off
REM =====================================================================
REM PowerShell-free server launcher (fallback for locked-down machines).
REM Started minimized by 启动服务.bat:  start "" /min serve-direct.cmd 8080
REM
REM This file owns the log redirection, because a process started with
REM "start /min node.exe ... > log" would get a NEW console and lose the
REM redirected handles (empty prod.out.log).
REM =====================================================================
setlocal
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

set "NODE=%ROOT%\node-runtime\win-x64\node.exe"
if not exist "%NODE%" set "NODE=node"

if not exist "%ROOT%\.run" md "%ROOT%\.run" >nul 2>&1
if not exist "%ROOT%\.run\logs" md "%ROOT%\.run\logs" >nul 2>&1
if not exist "%ROOT%\.run\jwt.secret" (
  "%NODE%" -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64'))" > "%ROOT%\.run\jwt.secret"
)
set "JWT="
set /p JWT=<"%ROOT%\.run\jwt.secret"

set "NODE_ENV=production"
set "HOST=0.0.0.0"
set "JWT_SECRET=%JWT%"
set "MAINTENANCE_DATA_DIR=%ROOT%\apps\server\data"
if not exist "%MAINTENANCE_DATA_DIR%" md "%MAINTENANCE_DATA_DIR%" >nul 2>&1
REM 让服务自己写 pid：cmd 无法可靠地取得子进程 PID，停止服务.bat 依赖这个文件
set "MR_PID_FILE=%ROOT%\.run\server-prod.pid"

cd /d "%ROOT%\apps\server"
echo [%DATE% %TIME%] starting on port %PORT% > "%ROOT%\.run\logs\prod.out.log"
REM 绝对路径：停止脚本按命令行反查进程时依赖它。
REM 发布包只有 index.cjs，开发仓库只有 index.js；两者都在时取「更新」的那个，
REM 否则旧的 bundle 会盖住刚构建的源码（改了代码却没生效）。
set "ENTRY="
for /f "delims=" %%A in ('dir /b /o-d "%ROOT%\apps\server\dist\index.cjs" "%ROOT%\apps\server\dist\index.js" 2^>nul') do if not defined ENTRY set "ENTRY=%ROOT%\apps\server\dist\%%A"
if not defined ENTRY set "ENTRY=%ROOT%\apps\server\dist\index.js"
"%NODE%" "%ENTRY%" 1>> "%ROOT%\.run\logs\prod.out.log" 2>> "%ROOT%\.run\logs\prod.err.log"
echo.
echo 服务已退出（端口 %PORT%）。日志：.run\logs\prod.err.log
REM 必须关掉这个窗口：启动服务.bat 用 start 拉起的 cmd 窗口会一直停在发布包目录，
REM 占着当前目录，导致以后重新生成/删除发布包时目录被锁（Remove-Item 报占用）。
timeout /t 5 >nul
exit