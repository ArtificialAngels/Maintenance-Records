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
title 维修记录系统 - 生产启动

REM 端口：默认 8080，不占用 80（80 常被 IIS / 公司系统占用，也没必要去争）。
REM 需要换端口时：启动服务.bat 8090
set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"

echo ============================================
echo    维修记录系统 - 生产启动（单进程）
echo ============================================
echo.

REM 权限说明：本系统不需要管理员权限，只监听 8080 这类高位端口，
REM 数据也只写自己目录下的 .run\ 与 apps\server\data\。
net session >nul 2>&1
if not errorlevel 1 goto :perm_done
echo [提示] 当前不是管理员权限，本系统不需要管理员权限运行。
echo.
:perm_done

if not exist "%ROOT%\node-runtime\win-x64\node.exe" (
  echo [错误] 未找到便携 Node，请先运行「安装便携Node.bat」。
  pause
  exit /b 1
)
if not exist "%ROOT%\apps\server\dist\index.js" if not exist "%ROOT%\apps\server\dist\index.cjs" (
  echo [错误] 缺少构建产物 apps\server\dist\index.js / index.cjs，发布包不完整，请重新拷贝整个目录。
  pause
  exit /b 1
)

REM 端口预检：已在运行就直接打开浏览器；被别的程序占用就一次性说清楚，
REM 不再先让 PowerShell 失败一次、再让 cmd 失败一次。
call :check_port %PORT%
if "%PR%"=="0" goto :already_running
if "%PR%"=="2" goto :port_busy

echo 正在启动生产服务（端口 %PORT%，稍候会自动打开浏览器）...
echo 日志：.run\logs\prod.*.log    停止：停止服务.bat
echo.

REM 设置 MR_NOBROWSER=1 可禁止自动打开浏览器（服务器/无人值守场景）。
REM 设置 MR_DIRECT=1 可跳过 PowerShell，直接用 cmd + node 启动。
set "NOBROWSER="
if defined MR_NOBROWSER set "NOBROWSER=-NoBrowser"

call :try_start
if not errorlevel 1 goto :all_done
goto :start_failed

:start_failed
echo.
echo [失败] 服务未能启动。日志：%ROOT%\.run\logs\prod.err.log
echo        端口 %PORT% 若被占用，可换一个： 启动服务.bat 8090
echo.
goto :all_done

:all_done
echo.
pause
exit /b 0

REM =====================================================================
REM 启动尝试：先走 PowerShell 脚本；被组策略/杀软拦截时回退到
REM serve-direct.cmd（纯 cmd + node，不依赖 PowerShell）。
REM =====================================================================
:try_start
set "USEDPS=1"
if defined MR_DIRECT set "USEDPS=0"
if "%USEDPS%"=="1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\start-prod.ps1" -Port %PORT% %NOBROWSER%
  if not errorlevel 1 exit /b 0
  echo.
  echo [警告] PowerShell 方式启动失败，改用不依赖 PowerShell 的方式重试...
  echo.
)
call :direct_start
exit /b %errorlevel%

:direct_start
call :check_port %PORT%
if "%PR%"=="0" goto :already_running
if "%PR%"=="2" goto :port_busy

del /f /q "%ROOT%\.run\server-prod.pid" >nul 2>&1
start "维修记录服务" /min "%ROOT%\scripts\serve-direct.cmd" %PORT%

set "READY="
for /l %%i in (1,1,15) do call :probe
if not defined READY goto :direct_fail

REM 正常情况下服务自己写入 pid；写不出时用端口反查兜底
if exist "%ROOT%\.run\server-prod.pid" goto :have_pid
set "SRVPID="
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /c:":%PORT% " ^| findstr /c:"LISTENING"') do set "SRVPID=%%a"
if defined SRVPID > "%ROOT%\.run\server-prod.pid" echo %SRVPID%
:have_pid
echo 生产服务已启动
call :show_urls
if not defined MR_NOBROWSER start "" "http://127.0.0.1:%PORT%/"
exit /b 0

:probe
if defined READY exit /b 0
REM 用 Node 自己做健康检查：curl 在旧系统上可能不存在，且 Node 一定有
"%ROOT%\node-runtime\win-x64\node.exe" -e "require('http').get('http://127.0.0.1:%PORT%/api/health',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)})" >nul 2>&1
if not errorlevel 1 set "READY=1"
if not defined READY ping -n 2 127.0.0.1 >nul
exit /b 0

REM 探测端口：0 = 本系统已在运行；2 = 被别的程序占用；3 = 空闲
:check_port
"%ROOT%\node-runtime\win-x64\node.exe" -e "var h=require('http');var q=h.get('http://127.0.0.1:%~1/api/health',function(r){process.exit(r.statusCode===200?0:2)});q.on('error',function(){process.exit(3)});q.setTimeout(1500,function(){q.destroy();process.exit(3)})" >nul 2>&1
set "PR=%errorlevel%"
exit /b 0

REM 打印本机地址 + 局域网地址（同事访问用）
:show_urls
set "LANIP="
set "IPTMP=%TEMP%\mr-lanip.txt"
if not defined TEMP set "IPTMP=%ROOT%\.run\lanip.txt"
"%ROOT%\node-runtime\win-x64\node.exe" -e "var os=require('os'),n=os.networkInterfaces(),r='';for(var k in n){n[k].forEach(function(i){if(!r&&i.family==='IPv4'&&!i.internal)r=i.address})}process.stdout.write(r)" > "%IPTMP%" 2>nul
if exist "%IPTMP%" set /p LANIP=<"%IPTMP%"
del /f /q "%IPTMP%" >nul 2>&1
echo 本机访问: http://127.0.0.1:%PORT%/
if defined LANIP echo 同事访问: http://%LANIP%:%PORT%/   ^(需防火墙放行 TCP %PORT%，见「开放防火墙.bat」^)
exit /b 0

:already_running
echo 本系统已在端口 %PORT% 运行（如需重启请先运行 停止服务.bat）。
call :show_urls
if not defined MR_NOBROWSER start "" "http://127.0.0.1:%PORT%/"
exit /b 0

:port_busy
echo [提示] 端口 %PORT% 已被其它程序占用（不是本系统，也不是本系统没退干净）。
echo        换一个端口即可：启动服务.bat 8090
echo        换了端口后，防火墙规则也要跟着放行：开放防火墙.bat 8090
echo.
goto :all_done

:direct_fail
echo.
echo [失败] 服务未能启动。日志：%ROOT%\.run\logs\prod.err.log
if exist "%ROOT%\.run\logs\prod.err.log" type "%ROOT%\.run\logs\prod.err.log"
exit /b 1
