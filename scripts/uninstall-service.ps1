# Maintenance Records - remove the Windows service
param(
  [int]$Port = 8080
)
$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$serviceName = 'MaintenanceRecords'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw '请以管理员身份运行。'
}

$candidates = @(
  (Join-Path $root 'nssm.exe'),
  (Join-Path $root 'nssm\nssm.exe'),
  (Join-Path $root 'tools\nssm.exe')
)
$nssm = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $nssm) { $nssm = (Get-Command nssm.exe -ErrorAction SilentlyContinue).Source }
if (-not $nssm) { throw '未找到 nssm.exe。' }

& $nssm stop $serviceName 2>$null
Start-Sleep -Seconds 2
& $nssm remove $serviceName confirm

Get-NetFirewallRule -DisplayName 'Maintenance Records' -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule -ErrorAction SilentlyContinue

Write-Host "服务 $serviceName 已移除（防火墙规则一并删除）。" -ForegroundColor Green
