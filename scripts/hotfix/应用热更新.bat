@echo off
chcp 936 >nul 2>&1
setlocal
title 维修记录系统 - 应用热更新
set "HERE=%~dp0"
set "PAYLOAD=%HERE%payload"

if not exist "%PAYLOAD%\apps\server\dist\index.cjs" goto :bad_package

REM 默认：把 hotfix 文件夹放进发布包目录里（和 启动服务.bat 同级）
set "ROOT=%HERE%.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

if exist "%ROOT%\apps\server\dist\index.cjs" goto :found

echo 没有在 "%ROOT%" 找到发布包。
echo.
echo 用法一：把整个 hotfix 文件夹复制到发布包目录里（和 启动服务.bat 同级），再双击本脚本。
echo 用法二：直接双击本脚本，然后把发布包文件夹的完整路径粘贴到下面。
echo.
set /p "ROOT=发布包路径: "
set "ROOT=%ROOT:"=%"
if not exist "%ROOT%\apps\server\dist\index.cjs" goto :bad_path

:found
call "%ROOT%\scripts\uncroot.cmd" ROOT "%ROOT%"
if errorlevel 1 goto :bad_unc

echo ============================================
echo    维修记录系统 - 应用热更新
echo ============================================
echo.
echo 发布包: %ROOT%
echo 内容  : 服务端程序 + 前端页面 + 启动脚本
echo 不会动: apps\server\data 里的数据（维修记录、图片、账号）
echo.
echo 将依次执行：停止服务 - 覆盖文件 - 重新启动服务。
echo.
pause

echo.
echo [1/4] 正在停止服务 ...
if exist "%ROOT%\scripts\stop-prod.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\stop-prod.ps1" >nul 2>&1
REM 兜底：pid 文件丢了也要停掉（按命令行反查本目录下的服务进程）
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*%ROOT%*index.c?js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [2/4] 正在覆盖前端页面 ...
if exist "%ROOT%\apps\web\dist\assets" rd /s /q "%ROOT%\apps\web\dist\assets" >nul 2>&1

echo [3/4] 正在覆盖服务端程序 ...
xcopy "%PAYLOAD%\*" "%ROOT%\" /E /I /Y /Q >nul
if errorlevel 1 goto :copy_failed
if not exist "%ROOT%\apps\server\dist\index.cjs" goto :copy_failed
if not exist "%ROOT%\apps\web\dist\index.html" goto :copy_failed

echo [4/4] 正在重新启动服务 ...
start "" "%ROOT%\启动服务.bat"

echo.
echo [完成] 热更新已应用。
echo        新的启动窗口里会显示本机地址和同事地址。
echo        同事那边请按 Ctrl+F5 强制刷新一次页面，避免浏览器用旧的缓存。
echo.
pause
exit /b 0

:copy_failed
echo.
echo [失败] 文件覆盖失败。常见原因：
echo        - 服务还在运行，index.cjs 被占用（先双击 停止服务.bat 再重试）
echo        - 发布包在只读共享盘 / 权限不足
echo        - 杀毒软件锁定了文件
echo.
pause
exit /b 1

:bad_package
echo [错误] 热更新包不完整：缺少 payload 目录。
echo        请重新解压完整的 hotfix 包，不要只复制 bat 文件。
echo.
pause
exit /b 1

:bad_path
echo.
echo [错误] 这个路径下没有发布包（找不到 apps\server\dist\index.cjs）：%ROOT%
echo.
pause
exit /b 1

:bad_unc
echo.
echo [错误] 共享盘路径映射失败：请确认能访问该共享盘。
echo.
pause
exit /b 1
