# Maintenance Records - stop the production single-process server
# Invoked by 停止服务.bat, 应用热更新.bat or directly.
$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root '.run'
$pidFile = Join-Path $runDir 'server-prod.pid'

function Kill-Tree($id) {
  if (-not $id) { return }
  & taskkill.exe /PID $id /T /F 2>$null | Out-Null
}

if (Test-Path $pidFile) {
  $raw = (Get-Content $pidFile -Raw).Trim()
  $recorded = 0
  if ([int]::TryParse($raw, [ref]$recorded)) { Kill-Tree $recorded }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Fallback: node processes running the compiled server from this project.
# Matches both the tsc output (index.js) and the release bundle (index.cjs),
# because a lost/stale pid file must never leave a server running.
$needle = [regex]::Escape($root) + '\\apps\\server\\dist\\index\.c?js'
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -ieq 'node.exe' -and $_.CommandLine -and $_.CommandLine -match $needle
}
foreach ($p in $procs) { Kill-Tree $p.ProcessId }

Start-Sleep -Milliseconds 600
Write-Output '[OK] Production server stopped.'
