@echo off
chcp 936 >nul 2>&1
setlocal
title 维修记录系统 - 开放防火墙端口
cd /d "%~dp0"

set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"

echo ============================================
echo    维修记录系统 - 开放防火墙端口
echo ============================================
echo.
echo 本机自己能打开不代表同事能打开：Windows 防火墙默认拦截别人的访问。
echo 这个脚本会添加一条入站规则，放行 TCP %PORT%（需要一次管理员权限）。
echo.

REM 已经是管理员就直接加规则；否则用 UAC 重新启动自己
net session >nul 2>&1
if not errorlevel 1 goto :add_rule

echo 正在请求管理员权限（会弹出 UAC 窗口，请点「是」）...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%PORT%' -Verb RunAs" >nul 2>&1
if errorlevel 1 goto :uac_failed
echo.
echo 已提交提权请求：请在弹窗里点「是」，规则会在新窗口里添加。
echo.
pause
exit /b 0

:uac_failed
echo.
echo [未能提权] 这台电脑不允许你提升到管理员。
echo 请把下面这行发给 IT，用管理员权限执行一次即可：
echo.
echo   netsh advfirewall firewall add rule name="Maintenance Records" dir=in action=allow protocol=TCP localport=%PORT%
echo.
pause
exit /b 1

:add_rule
echo 当前已经是管理员权限。
echo.
REM 先删同名旧规则，避免重复或端口不一致
netsh advfirewall firewall delete rule name="Maintenance Records" >nul 2>&1
netsh advfirewall firewall add rule name="Maintenance Records" dir=in action=allow protocol=TCP localport=%PORT%
if errorlevel 1 goto :add_failed

echo.
echo [完成] 已放行入站 TCP %PORT%。
echo        同事现在可以通过 http://本机IP:%PORT%/ 访问（本机IP见「诊断.bat」报告）。
echo        以后换端口运行时，再双击本脚本并传入新端口，例如：开放防火墙.bat 8090
echo.
pause
exit /b 0

:add_failed
echo.
echo [失败] 添加防火墙规则失败。请把下面这行发给 IT 手动执行：
echo.
echo   netsh advfirewall firewall add rule name="Maintenance Records" dir=in action=allow protocol=TCP localport=%PORT%
echo.
pause
exit /b 1
