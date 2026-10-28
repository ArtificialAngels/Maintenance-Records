# Maintenance Records - stop background services
# Invoked by the root stop.bat.
$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root '.run'

function Kill-Tree($id) {
  if (-not $id) { return }
  & taskkill.exe /PID $id /T /F /FI "MEMUSAGE gt 0" 2>$null | Out-Null
}

# 1) Processes recorded when the launcher started (dev + production).
foreach ($name in @('server.pid', 'web.pid', 'server-prod.pid')) {
  $pidFile = Join-Path $runDir $name
  if (Test-Path $pidFile) {
    $raw = (Get-Content $pidFile -Raw).Trim()
    $recorded = 0
    if ([int]::TryParse($raw, [ref]$recorded)) { Kill-Tree $recorded }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Milliseconds 500

# 2) Fallback: whatever is still listening on the two ports.
foreach ($port in @(8787, 5173)) {
  $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($owner in $owners) { Kill-Tree $owner }
}

# 3) Fallback: leftover cmd / node windows from this project.
$prodNeedle = ($root -replace '\\', '\\') + '\\apps\\server\\dist\\index\.js'
$leftovers = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and
  $_.CommandLine -like ('*' + $root + '*') -and
  ($_.CommandLine -like '*tsx\dist\cli.mjs*' -or
   $_.CommandLine -like '*vite\bin\vite.js*' -or
   $_.CommandLine -match $prodNeedle)
}
foreach ($p in $leftovers) { Kill-Tree $p.ProcessId }

Start-Sleep -Milliseconds 800

$still = @()
foreach ($port in @(8787, 5173)) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    $still += $port
  }
}

if ($still.Count -gt 0) {
  Write-Output ('[WARN] Services still listening on port(s): ' + ($still -join ', '))
  exit 1
}
Write-Output '[OK] Maintenance Records services stopped (8787 / 5173).'
exit 0
