# Maintenance Records - production launcher (single process)
#
# Runs the compiled server (apps/server/dist/index.js) with the portable
# Node runtime, hidden in the background. The same process serves the API,
# WebSocket and the built frontend. Invoked by 启动服务.bat.
#
# Params:
#   -Port 8080          listen port (default 8080; port 80 is never used)
#   -Bind 0.0.0.0       bind address (default all interfaces)
#   -DataDir <path>     override MAINTENANCE_DATA_DIR
#   -RunDir <path>      override the .run directory (pid + logs); 诊断.bat uses a
#                       temp dir so its test instance cannot clobber a live server
#   -SkipBuild          do not build even if dist is missing
#   -NoBrowser          never open a browser window (used by 诊断.bat)
param(
  [int]$Port = 8080,
  [string]$Bind = '0.0.0.0',
  [string]$DataDir = '',
  [string]$RunDir = '',
  [switch]$SkipBuild,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runDir = if ($RunDir) { $RunDir } else { Join-Path $root '.run' }
$logDir = Join-Path $runDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Node 的 ESM 无法从 \\ UNC 路径运行（ERR_INVALID_FILE_URL_PATH）。
# 启动服务.bat 已自动把共享盘映射为盘符；直接调用本脚本的场景在此拦截。
if ($root -like '\\*') {
  throw '项目在共享盘（UNC 路径）上：请双击「启动服务.bat」启动（脚本会自动把共享盘映射为盘符）。'
}

$arch = if ([Environment]::Is64BitOperatingSystem) { 'win-x64' } else { 'win-x86' }
$node = Join-Path $root "node-runtime\$arch\node.exe"
if (-not (Test-Path $node)) {
  $sys = Get-Command node -ErrorAction SilentlyContinue
  if ($sys) { $node = $sys.Source } else {
    throw 'Node not found. Run "安装便携Node.bat" first, or install Node.js 20+.'
  }
}
# Release ships a single-file bundle (dist/index.cjs); the dev repo has the
# plain tsc output (dist/index.js). Use whichever is NEWER: a leftover bundle
# from an older release must never shadow freshly built source (that silently
# runs old code and makes UI features look "broken").
$serverBundle = Join-Path $root 'apps\server\dist\index.cjs'
$serverPlain = Join-Path $root 'apps\server\dist\index.js'
$serverEntry = $serverPlain
if (Test-Path $serverBundle) {
  if (-not (Test-Path $serverPlain)) {
    $serverEntry = $serverBundle
  } elseif ((Get-Item $serverBundle).LastWriteTime -ge (Get-Item $serverPlain).LastWriteTime) {
    $serverEntry = $serverBundle
  }
}
Write-Host "服务端入口: $serverEntry"
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

# Proxy-free HTTP probe: corporate machines often set HTTP(S)_PROXY, which
# makes Invoke-WebRequest to 127.0.0.1 hang until timeout.
function Test-Url($url) {
  try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Proxy = $null
    $req.Timeout = 2000
    $req.ReadWriteTimeout = 2000
    $req.KeepAlive = $false
    $resp = $req.GetResponse()
    $ok = ($resp.StatusCode -eq [System.Net.HttpStatusCode]::OK)
    $resp.Close()
    return $ok
  } catch { return $false }
}

if (Test-Port $Port) {
  # Port busy: is it us (a previous instance) or another program?
  if (Test-Url "http://127.0.0.1:$Port/api/health") {
    Write-Host "本系统已在端口 $Port 运行；打开浏览器（如需重启请先运行 停止服务.bat）。"
    if (-not $NoBrowser) { Start-Process ("http://127.0.0.1:$Port/") }
    exit 0
  }
  Write-Warning "端口 $Port 已被其它程序占用（不是本系统）。请换一个端口，例如：启动服务.bat 8090"
  exit 1
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
  if ((Test-Port $Port) -and (Test-Url "http://127.0.0.1:$Port/api/health")) {
    $ready = $true
    break
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

# 同事访问用的局域网地址（第一块非回环 IPv4）
$lanIp = $null
try {
  $lanIp = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -ne 'Loopback' } |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
    Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } |
    Select-Object -ExpandProperty Address -First 1 |
    ForEach-Object { $_.IPAddressToString }
} catch { }
if ($lanIp) {
  Write-Host "同事访问: http://${lanIp}:$Port/   (需防火墙放行 TCP $Port，见「开放防火墙.bat」)" -ForegroundColor Green
}
if (-not $NoBrowser) { Start-Process ("http://127.0.0.1:$Port/") }
