@echo off
chcp 936 >nul 2>&1
setlocal EnableExtensions
cd /d "%~dp0"
title 维修记录系统 - 环境诊断
set "REPORT=%~dp0诊断报告.txt"

> "%REPORT%" echo 维修记录系统环境诊断报告
>> "%REPORT%" echo 生成时间: %DATE% %TIME%
>> "%REPORT%" echo 运行目录: %~dp0
>> "%REPORT%" echo 处理器架构: %PROCESSOR_ARCHITECTURE%
>> "%REPORT%" echo 本机名: %COMPUTERNAME%    用户: %USERNAME%
ver >> "%REPORT%" 2>&1
>> "%REPORT%" echo --- 本机 IPv4 地址（同事访问用）---
ipconfig 2>&1 | findstr /c:"IPv4" >> "%REPORT%"
>> "%REPORT%" echo.

echo [1/8] 检查便携 Node ...
if not exist "node-runtime\win-x64\node.exe" goto :no_node
>> "%REPORT%" echo [OK] node-runtime\win-x64\node.exe 存在
for /f "delims=" %%v in ('"node-runtime\win-x64\node.exe" -v 2^>^&1') do >> "%REPORT%" echo      node 版本: %%v
goto :node_done
:no_node
>> "%REPORT%" echo [失败] 缺少 node-runtime\win-x64\node.exe（发布包不完整，请重新拷贝整个目录）
:node_done
>> "%REPORT%" echo.

echo [2/8] 检查构建产物 ...
REM 发布包是单文件 bundle（index.cjs / set-password.cjs），开发目录是 tsc 产物（.js）
if exist "apps\server\dist\index.cjs" >> "%REPORT%" echo [OK] apps\server\dist\index.cjs（单文件 bundle）
if not exist "apps\server\dist\index.cjs" if exist "apps\server\dist\index.js" >> "%REPORT%" echo [OK] apps\server\dist\index.js（tsc 产物）
if not exist "apps\server\dist\index.cjs" if not exist "apps\server\dist\index.js" >> "%REPORT%" echo [失败] 缺少 apps\server\dist\index.cjs / index.js
if exist "apps\web\dist\index.html" >> "%REPORT%" echo [OK] apps\web\dist\index.html
if not exist "apps\web\dist\index.html" >> "%REPORT%" echo [失败] 缺少 apps\web\dist\index.html
if exist "apps\server\dist\cli\set-password.cjs" >> "%REPORT%" echo [OK] 改密码 CLI 存在（bundle）
if not exist "apps\server\dist\cli\set-password.cjs" if exist "apps\server\dist\cli\set-password.js" >> "%REPORT%" echo [OK] 改密码 CLI 存在
if not exist "apps\server\dist\cli\set-password.cjs" if not exist "apps\server\dist\cli\set-password.js" >> "%REPORT%" echo [警告] 缺少改密码 CLI
>> "%REPORT%" echo.

echo [3/8] 检查目录写权限（.run 与数据目录依赖它）...
> "%~dp0_writetest.tmp" echo test 2>nul
if not exist "%~dp0_writetest.tmp" goto :no_write
>> "%REPORT%" echo [OK] 目录可写
goto :write_done
:no_write
>> "%REPORT%" echo [失败] 目录不可写：无法创建 .run 和 apps\server\data（检查权限/只读/杀软保护）
>> "%REPORT%" echo        发布包不要放在 C:\ 根目录或 Program Files，建议 D:\ 或用户目录
:write_done
del /f /q "%~dp0_writetest.tmp" >nul 2>&1
>> "%REPORT%" echo.

echo [4/8] 检查权限、8080 端口占用与防火墙规则 ...
>> "%REPORT%" echo 说明: 本系统不需要管理员权限运行（Windows 不限制 <1024 端口）；
>> "%REPORT%" echo       仅「注册 Windows 服务」和「添加防火墙入站规则」需要一次管理员权限。
net session >nul 2>&1
if errorlevel 1 goto :not_admin
>> "%REPORT%" echo [是] 当前具备管理员权限
goto :admin_done
:not_admin
>> "%REPORT%" echo [否] 当前是标准用户权限（正常运行本系统不需要管理员，可忽略）
:admin_done
>> "%REPORT%" echo --- 是否在管理员组 ---
whoami /groups 2>&1 | findstr /c:"S-1-5-32-544" >> "%REPORT%"
>> "%REPORT%" echo --- 端口占用状态 ---
>> "%REPORT%" echo     FREE=空闲  USED-MR=本系统在跑  USED-OTHER=被别的程序占用（会显示它的 Server 头）
set "PORTLOG=%TEMP%\mr_ports.log"
"node-runtime\win-x64\node.exe" -e "var n=require('net'),h=require('http');function ask(p,cb){var q=h.get({host:'127.0.0.1',port:p,path:'/api/health',timeout:1500},function(r){if(r.statusCode===200){r.resume();cb('USED-MR');return}var srv=r.headers.server||'unknown';r.destroy();var q2=h.get({host:'127.0.0.1',port:p,path:'/',timeout:1500},function(r2){r2.resume();cb('USED-OTHER server='+srv+' status='+r2.statusCode)});q2.on('error',function(){cb('USED-OTHER server='+srv)});q2.setTimeout(1500,function(){q2.destroy();cb('USED-OTHER server='+srv)})});q.on('error',function(){cb('USED-OTHER')});q.setTimeout(1500,function(){q.destroy();cb('USED-OTHER')})}function probe(p){return new Promise(function(res){var s=n.connect(p,'127.0.0.1'),done=false;function fin(v){if(!done){done=true;res(v)}}s.on('connect',function(){s.destroy();ask(p,fin)});s.on('error',function(){fin('FREE')});setTimeout(function(){s.destroy();fin('FREE')},1200)})}Promise.all([8080,80].map(probe)).then(function(r){console.log('8080='+r[0]);console.log('80='+r[1])})" > "%PORTLOG%" 2>nul
type "%PORTLOG%" >> "%REPORT%" 2>&1
del /f /q "%PORTLOG%" >nul 2>&1
>> "%REPORT%" echo     注: 本系统默认用 8080；上面那行 80 只是参考，80 被 IIS/公司系统占用不影响使用。
>> "%REPORT%" echo --- 防火墙入站规则（局域网其它电脑访问需要）---
netsh advfirewall firewall show rule name="Maintenance Records" >nul 2>&1
if errorlevel 1 goto :no_fw
>> "%REPORT%" echo [OK] 已存在入站规则 "Maintenance Records"
goto :fw_done
:no_fw
>> "%REPORT%" echo [警告] 未找到入站规则 "Maintenance Records"：本机可用，但局域网其它电脑可能连不上
>> "%REPORT%" echo        解决: 双击「开放防火墙.bat」（会用 UAC 提权，一次即可）
>> "%REPORT%" echo        或让 IT 执行: netsh advfirewall firewall add rule name="Maintenance Records" dir=in action=allow protocol=TCP localport=8080
:fw_done
>> "%REPORT%" echo.

echo [5/8] 检查 PowerShell（启动脚本依赖它，被拦截时可用 MR_DIRECT=1 兜底）...
>> "%REPORT%" echo --- where powershell ---
where powershell >> "%REPORT%" 2>&1
if errorlevel 1 >> "%REPORT%" echo [失败] 系统中未找到 powershell.exe
>> "%REPORT%" echo --- PowerShell 版本 ---
powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()" >> "%REPORT%" 2>&1
>> "%REPORT%" echo --- 执行策略（Group Policy 覆盖时 -ExecutionPolicy Bypass 无效）---
powershell -NoProfile -Command "Get-ExecutionPolicy -List | Format-Table -AutoSize | Out-String" >> "%REPORT%" 2>&1
>> "%REPORT%" echo --- 脚本文件执行探测 ---
> "%TEMP%\mr_probe.ps1" echo Write-Output MR_PS_FILE_OK
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\mr_probe.ps1" >> "%REPORT%" 2>&1
del /f /q "%TEMP%\mr_probe.ps1" >nul 2>&1
>> "%REPORT%" echo.

echo [6/8] 当前网络盘映射 ...
net use >> "%REPORT%" 2>&1
>> "%REPORT%" echo.

echo [7/8] .run 状态 ...
if exist ".run" >> "%REPORT%" echo [已存在] .run
if not exist ".run" >> "%REPORT%" echo [未生成] .run
>> "%REPORT%" echo.

REM 测试端口：避开已被占用的端口，避免误判成启动失败
set "TESTPORT="
for %%P in (8099 8098 8097 8096 8095 8094) do if not defined TESTPORT call :pickport %%P
if not defined TESTPORT set "TESTPORT=8099"

echo [8/8] 实际尝试启动一次（端口 %TESTPORT%，不影响正在运行的 8080）...
>> "%REPORT%" echo --- start-prod.ps1 输出（端口 %TESTPORT%）---
REM 启动输出先写独立临时文件：直接 >> 报告会被 node 子进程继承句柄，报告随后无法写入
REM 测试实例用独立的 .run 目录：绝不碰正在运行的服务（pid 文件、日志）
set "DIAG_RUN=%TEMP%\mr_diag_run"
rd /s /q "%DIAG_RUN%" >nul 2>&1
set "STARTLOG=%TEMP%\mr_diag_start.log"
del /f /q "%STARTLOG%" >nul 2>&1
set "MR_NOBROWSER=1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-prod.ps1" -Port %TESTPORT% -SkipBuild -NoBrowser -RunDir "%DIAG_RUN%" > "%STARTLOG%" 2>&1
>> "%REPORT%" echo 启动脚本退出码: %errorlevel%

if not exist "%DIAG_RUN%\server-prod.pid" goto :killed
set /p TESTPID=<"%DIAG_RUN%\server-prod.pid"
taskkill /PID %TESTPID% /T /F >> "%REPORT%" 2>&1
:killed

>> "%REPORT%" echo --- 启动输出 ---
REM PowerShell 重定向输出是 UTF-8，报告是 GBK：先转码再追加（严格按 UTF-8 解码，失败则按本机代码页）
set "STARTGBK=%TEMP%\mr_start_gbk.txt"
powershell -NoProfile -Command "$b=[IO.File]::ReadAllBytes('%STARTLOG%');$u=[Text.Encoding]::GetEncoding(65001,[Text.EncoderFallback]::ExceptionFallback,[Text.DecoderFallback]::ExceptionFallback);try{$s=$u.GetString($b)}catch{$s=[Text.Encoding]::Default.GetString($b)};[IO.File]::WriteAllText('%STARTGBK%',$s,[Text.Encoding]::Default)" >nul 2>&1
if exist "%STARTGBK%" type "%STARTGBK%" >> "%REPORT%" 2>&1
if not exist "%STARTGBK%" type "%STARTLOG%" >> "%REPORT%" 2>&1
del /f /q "%STARTGBK%" "%STARTLOG%" >nul 2>&1

REM 服务日志是 UTF-8（pino JSON），报告是 GBK：先转码再追加，否则报告里日志是乱码
if not exist "%DIAG_RUN%\logs\prod.err.log" goto :after_err
>> "%REPORT%" echo --- prod.err.log（最后 15 行）---
powershell -NoProfile -Command "Get-Content '%DIAG_RUN%\logs\prod.err.log' -Tail 15 -Encoding UTF8 | Out-File -FilePath '%TEMP%\mr_err.txt' -Encoding Default" >nul 2>&1
if exist "%TEMP%\mr_err.txt" type "%TEMP%\mr_err.txt" >> "%REPORT%" 2>&1
del /f /q "%TEMP%\mr_err.txt" >nul 2>&1
:after_err
if not exist "%DIAG_RUN%\logs\prod.out.log" goto :after_out
>> "%REPORT%" echo --- prod.out.log（最后 10 行）---
powershell -NoProfile -Command "Get-Content '%DIAG_RUN%\logs\prod.out.log' -Tail 10 -Encoding UTF8 | Out-File -FilePath '%TEMP%\mr_out.txt' -Encoding Default" >nul 2>&1
if exist "%TEMP%\mr_out.txt" type "%TEMP%\mr_out.txt" >> "%REPORT%" 2>&1
del /f /q "%TEMP%\mr_out.txt" >nul 2>&1
:after_out
>> "%REPORT%" echo.

rd /s /q "%DIAG_RUN%" >nul 2>&1

echo.
echo ============================================
echo   诊断完成。报告位置：
echo   %REPORT%
echo.
echo   请把「诊断报告.txt」发回以便定位问题。
echo ============================================
pause
exit /b 0

:pickport
netstat -ano 2>&1 | findstr /c:":%~1 " | findstr /c:"LISTENING" >nul 2>&1
if not errorlevel 1 exit /b 0
set "TESTPORT=%~1"
exit /b 0