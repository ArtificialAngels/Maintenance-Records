# Maintenance Records - download the portable Node runtime
#
# Layout (mirrors the reference deployment):
#   node-runtime\win-x64\node.exe     portable Node (single binary, ~90MB)
#   node-runtime\tools\pnpm.exe       standalone pnpm for dependency installs
#   node-runtime\VERSION.json         what is installed
#
# node-runtime/ is gitignored: every machine fetches its own copy once.
param(
  [string]$NodeVersion = 'v24.22.1',
  [string]$PnpmVersion = '9.12.0',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root 'node-runtime'
$archDir = Join-Path $runtimeDir 'win-x64'
$toolsDir = Join-Path $runtimeDir 'tools'
$nodeExe = Join-Path $archDir 'node.exe'
$pnpmExe = Join-Path $toolsDir 'pnpm.exe'
$versionFile = Join-Path $runtimeDir 'VERSION.json'

New-Item -ItemType Directory -Force -Path $archDir | Out-Null
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

if (-not [Environment]::Is64BitOperatingSystem) {
  throw 'Only 64-bit Windows is supported (win-x64).'
}

function Download-File($url, $dest) {
  $tmp = "$dest.download"
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
  $lastErr = $null
  for ($i = 1; $i -le 3; $i++) {
    try {
      Write-Host "  attempt $i : $url"
      Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 600
      if ((Test-Path $tmp) -and (Get-Item $tmp).Length -gt 1MB) {
        Move-Item $tmp $dest -Force
        return
      }
      throw 'downloaded file is too small'
    } catch {
      $lastErr = $_
      Write-Host "  failed: $($_.Exception.Message)"
      Start-Sleep -Seconds 2
    }
  }
  throw "download failed after 3 attempts: $url`n$lastErr"
}

# ---- Node ----
if ($Force -and (Test-Path $nodeExe)) { Remove-Item $nodeExe -Force }
if (Test-Path $nodeExe) {
  $have = & $nodeExe --version 2>$null
  Write-Host "[node] already present: $have ($nodeExe)"
} else {
  $nodeUrl = "https://nodejs.org/dist/$NodeVersion/win-x64/node.exe"
  Write-Host "[node] downloading $NodeVersion (win-x64) ..."
  Download-File $nodeUrl $nodeExe
  $have = & $nodeExe --version
  Write-Host "[node] installed: $have"
}

# ---- pnpm (standalone exe, only used for dependency install) ----
if ($Force -and (Test-Path $pnpmExe)) { Remove-Item $pnpmExe -Force }
if (Test-Path $pnpmExe) {
  $havePnpm = & $pnpmExe --version 2>$null
  Write-Host "[pnpm] already present: $havePnpm ($pnpmExe)"
} else {
  $pnpmUrl = "https://github.com/pnpm/pnpm/releases/download/v$PnpmVersion/pnpm-win-x64.exe"
  Write-Host "[pnpm] downloading $PnpmVersion (standalone) ..."
  Download-File $pnpmUrl $pnpmExe
  $havePnpm = & $pnpmExe --version
  Write-Host "[pnpm] installed: $havePnpm"
}

# ---- version manifest ----
$manifest = [ordered]@{
  nodeVersion = (& $nodeExe --version)
  pnpmVersion = (& $pnpmExe --version)
  arch        = 'win-x64'
  installedAt = (Get-Date).ToString('s')
}
$manifest | ConvertTo-Json | Set-Content -Path $versionFile -Encoding ascii

Write-Host ''
Write-Host 'Portable runtime ready under node-runtime\' -ForegroundColor Green
Write-Host "  node: $($manifest.nodeVersion)"
Write-Host "  pnpm: $($manifest.pnpmVersion)"
