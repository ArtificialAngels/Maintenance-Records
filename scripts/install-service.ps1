# Maintenance Records - register as a Windows service (NSSM)
#
# Requires:
#   - Administrator rights
#   - nssm.exe either on PATH or placed in the project root
#     (download "nssm 2.24" from https://nssm.cc/release/nssm-2.24.zip, take
#     win64/nssm.exe and copy it next to this project folder)
#
# After install, the service starts automatically at boot and restarts on
# crash. Users open http://<server-name>/ once DNS points to this machine.
param(
  [int]$Port = 80,
  [string]$Bind = '0.0.0.0',
  [string]$DataDir = ''
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$serviceName = 'MaintenanceRecords'

# --- Admin check ---
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw '请以管理员身份运行（右键「安装Windows服务.bat」→ 以管理员身份运行）。'
}

# --- Locate nssm ---
$candidates = @(
  (Join-Path $root 'nssm.exe'),
  (Join-Path $root 'nssm\nssm.exe'),
  (Join-Path $root 'tools\nssm.exe')
)
$nssm = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $nssm) {
  $onPath = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($onPath) { $nssm = $onPath.Source }
}
if (-not $nssm) {
  throw @'
未找到 nssm.exe。请从 https://nssm.cc/release/nssm-2.24.zip 下载，
解压后把 win64\nssm.exe 放到项目根目录 D:\Github\Maintenance-Records\，
再重新运行本脚本。
'@
}

# --- Build artifacts ---
$serverEntry = Join-Path $root 'apps\server\dist\index.js'
$webIndex = Join-Path $root 'apps\web\dist\index.html'
if (-not (Test-Path $serverEntry) -or -not (Test-Path $webIndex)) {
  Write-Host '未找到生产构建，先执行构建...'
  & (Join-Path $PSScriptRoot 'build-prod.ps1')
}

# --- Runtime + data + secret ---
$arch = if ([Environment]::Is64BitOperatingSystem) { 'win-x64' } else { 'win-x86' }
$node = Join-Path $root "node-runtime\$arch\node.exe"
if (-not (Test-Path $node)) { throw "未找到便携 Node：$node" }
if (-not $DataDir) { $DataDir = Join-Path $root 'apps\server\data' }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$runDir = Join-Path $root '.run'
$logDir = Join-Path $runDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$secretFile = Join-Path $runDir 'jwt.secret'
if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [IO.File]::WriteAllText($secretFile, ([Convert]::ToBase64String($bytes)), [Text.UTF8Encoding]::new($false))
}
$jwtSecret = [IO.File]::ReadAllText($secretFile).Trim()

# --- Reinstall cleanly ---
$existing = & $nssm status $serviceName 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "服务 $serviceName 已存在，先移除旧实例..."
  & $nssm stop $serviceName 2>$null
  Start-Sleep -Seconds 2
  & $nssm remove $serviceName confirm
}

& $nssm install $serviceName $node "`"$serverEntry`""
if ($LASTEXITCODE -ne 0) { throw 'nssm install 失败' }
& $nssm set $serviceName AppDirectory (Join-Path $root 'apps\server') | Out-Null
& $nssm set $serviceName DisplayName '维修记录系统 Maintenance Records' | Out-Null
& $nssm set $serviceName Description '维修记录系统 Fastify 服务（页面 + API + WebSocket）' | Out-Null
& $nssm set $serviceName Start SERVICE_AUTO_START | Out-Null
& $nssm set $serviceName AppExit Default Restart | Out-Null
& $nssm set $serviceName AppRestartDelay 5000 | Out-Null
& $nssm set $serviceName AppStdout (Join-Path $logDir 'service.out.log') | Out-Null
& $nssm set $serviceName AppStderr (Join-Path $logDir 'service.err.log') | Out-Null
& $nssm set $serviceName AppRotateFiles 1 | Out-Null
& $nssm set $serviceName AppRotateBytes 10485760 | Out-Null
& $nssm set $serviceName AppEnvironmentExtra `
  "NODE_ENV=production" `
  "HOST=$Bind" `
  "PORT=$Port" `
  "JWT_SECRET=$jwtSecret" `
  "MAINTENANCE_DATA_DIR=$DataDir" | Out-Null

& $nssm start $serviceName
Start-Sleep -Seconds 3

# --- Firewall ---
$rule = Get-NetFirewallRule -DisplayName 'Maintenance Records' -ErrorAction SilentlyContinue
if (-not $rule) {
  New-NetFirewallRule -DisplayName 'Maintenance Records' `
    -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
  Write-Host "已添加入站防火墙规则（TCP $Port）。"
}

Write-Host ""
Write-Host "服务安装完成：$serviceName（端口 $Port，自动启动，崩溃自动重启）" -ForegroundColor Green
Write-Host "本机访问：http://127.0.0.1:$Port/"
Write-Host "找 IT 配置内网 DNS A 记录指向本机 IP，用户即可通过域名访问。"
