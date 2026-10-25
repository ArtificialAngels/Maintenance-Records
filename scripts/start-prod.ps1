# Maintenance Records - production launcher (single process)
#
# Runs the compiled server (apps/server/dist/index.js) with the portable
# Node runtime, hidden in the background. The same process serves the API,
# WebSocket and the built frontend. Invoked by 启动服务.bat.
#
# Params:
#   -Port 80            listen port (default 80)
#   -Bind 0.0.0.0       bind address (default all interfaces)
#   -DataDir <path>     override MAINTENANCE_DATA_DIR
#   -SkipBuild          do not build even if dist is missing
param(
  [int]$Port = 80,
  [string]$Bind = '0.0.0.0',
  [string]$DataDir = '',
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root '.run'
$logDir = Join-Path $runDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$arch = if ([Environment]::Is64BitOperatingSystem) { 'win-x64' } else { 'win-x86' }
$node = Join-Path $root "node-runtime\$arch\node.exe"
if (-not (Test-Path $node)) {
  $sys = Get-Command node -ErrorAction SilentlyContinue
  if ($sys) { $node = $sys.Source } else {
    throw 'Node not found. Run "安装便携Node.bat" first, or install Node.js 20+.'
  }
}
$serverEntry = Join-Path $root 'apps\server\dist\index.js'
$webIndex = Join-Path $root 'apps\web\dist\index.html'
if (-not (Test-Path $serverEntry) -or -not (Test-Path $webIndex)) {
  if ($SkipBuild) { throw 'Production build missing. Run scripts/build-prod.ps1 first.' }
  Write-Host 'Build artifacts missing, running production build...'
  & (Join-Path $PSScriptRoot 'build-prod.ps1')
}

function Test-Port($p) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('127.0.0.1', $p, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(700)) { return $false }
    try { $client.EndConnect($iar); return $true } catch { return $false }
  } catch { return $false } finally { $client.Close() }
}

if (Test-Port $Port) {
  Write-Host "Port $Port already in use; opening browser instead."
  Start-Process ("http://127.0.0.1:$Port/")
  exit 0
}

# Persistent JWT secret (generated once, kept outside git).
$secretFile = Join-Path $runDir 'jwt.secret'
if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [IO.File]::WriteAllText($secretFile, ([Convert]::ToBase64String($bytes)), [Text.UTF8Encoding]::new($false))
}
$jwtSecret = [IO.File]::ReadAllText($secretFile).Trim()
if (-not $DataDir) { $DataDir = Join-Path $root 'apps\server\data' }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$env:NODE_ENV = 'production'
$env:HOST = $Bind
$env:PORT = "$Port"
$env:JWT_SECRET = $jwtSecret
$env:MAINTENANCE_DATA_DIR = $DataDir

$outLog = Join-Path $logDir 'prod.out.log'
$errLog = Join-Path $logDir 'prod.err.log'
$proc = Start-Process -FilePath $node `
  -ArgumentList "`"$serverEntry`"" `
  -WorkingDirectory (Join-Path $root 'apps\server') `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog `
  -PassThru
Set-Content -Path (Join-Path $runDir 'server-prod.pid') -Value $proc.Id -Encoding ascii

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if ($proc.HasExited) { break }
  if (Test-Port $Port) {
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {}
  }
}

if (-not $ready) {
  & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null
  Remove-Item (Join-Path $runDir 'server-prod.pid') -Force -ErrorAction SilentlyContinue
  Write-Warning "生产服务启动失败，请查看日志：$logDir"
  if (Test-Path $errLog) { Get-Content $errLog -Tail 20 }
  exit 1
}

Write-Host "生产服务已启动: http://127.0.0.1:$Port/  (绑定 $Bind)" -ForegroundColor Green
Start-Process ("http://127.0.0.1:$Port/")
