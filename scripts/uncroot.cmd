@echo off
REM =====================================================================
REM Shared-drive (UNC) bootstrap for Maintenance Records.
REM
REM Node's ESM loader cannot run from a \\server\share path on Windows
REM (ERR_INVALID_FILE_URL_PATH), and cmd.exe cannot use a UNC path as the
REM current directory either. The fix is the same trick as "pushd": map
REM the share to a free drive letter so every path becomes local.
REM
REM Usage (from any .bat):
REM   set "ROOT=%~dp0"
REM   call "%~dp0scripts\uncroot.cmd" ROOT "%ROOT%"
REM   if errorlevel 1 ( ...report... & exit /b 1 )
REM   cd /d "%ROOT%"
REM
REM On success the named variable is set to a drive-letter path WITHOUT a
REM trailing backslash. Local paths are returned unchanged (trimmed).
REM
REM NOTE: intentionally written with goto-style flow instead of multi-line
REM ( ... ) blocks around expanded paths, because cmd mis-parses blocks when
REM a path contains "(" or ")" (e.g. C:\Program Files (x86)\...).
REM =====================================================================
setlocal EnableDelayedExpansion

set "UNC=%~2"
if not defined UNC exit /b 1

REM ---- local path: pass through, trimming the trailing backslash --------
if not "%UNC:~0,2%"=="\\" goto :local

REM ---- UNC path: map \\server\share to a free drive letter --------------
if "%UNC:~-1%"=="\" set "UNC=%UNC:~0,-1%"
set "BODY=%UNC:~2%"
set "SRV="
set "SHR="
set "REST="
for /f "tokens=1,2,* delims=\" %%A in ("!BODY!") do (
  set "SRV=%%A"
  set "SHR=%%B"
  set "REST=%%C"
)
if not defined SHR goto :badpath

set "BASE=\\!SRV!\!SHR!"
set "LETTER="

REM Reuse an existing mapping of the same share when possible.
for /f "tokens=1,2,3" %%i in ('net use 2^>nul ^| findstr /c:"\\"') do call :try_reuse "%%k" "%%j"
if defined LETTER goto :finish

REM Otherwise pick the first free drive letter.
for %%L in (Z Y X W V U T S R Q P O N M L K J I H G) do call :try_pick %%L
if not defined LETTER goto :nofree

net use "!LETTER!:" "!BASE!" /persistent:no >nul 2>&1
if errorlevel 1 goto :mapfail
goto :finish

:try_reuse
if defined LETTER exit /b 0
if /i not "%~1"=="!BASE!" exit /b 0
set "CAND=%~2"
set "CAND=!CAND::=!"
if exist "!CAND!:\" set "LETTER=!CAND!"
exit /b 0

:try_pick
if defined LETTER exit /b 0
if not exist "%~1:\" set "LETTER=%~1"
exit /b 0

:finish
set "ROOT=!LETTER!:\"
if defined REST set "ROOT=!LETTER!:\!REST!"
if not exist "!ROOT!\package.json" goto :noproj
for /f "delims=" %%v in ("!ROOT!") do endlocal & set "%~1=%%v"
exit /b 0

:local
if "%UNC:~-1%"=="\" set "UNC=%UNC:~0,-1%"
for /f "delims=" %%v in ("!UNC!") do endlocal & set "%~1=%%v"
exit /b 0

:badpath
echo [ERROR] Cannot parse UNC path "%UNC%".
endlocal & exit /b 1

:nofree
echo [ERROR] No free drive letter available to map "%BASE%".
endlocal & exit /b 1

:mapfail
echo [ERROR] "net use !LETTER!: !BASE!" failed.
echo         Check share permissions, or map the share manually first.
endlocal & exit /b 1

:noproj
echo [ERROR] Project not found under "!ROOT!" ^(looking for package.json^).
endlocal & exit /b 1
