# Maintenance Records - build a small "hot update" package.
#
# Re-generating the full release copies node.exe again (94 MB). When only the
# program changed, this package (~5 MB) is enough:
#
#   Maintenance-Records-hotfix\
#     应用热更新.bat        stop -> overwrite -> restart
#     说明.txt
#     payload\apps\server\dist\index.cjs
#     payload\apps\web\dist\...
#     payload\scripts\{start-prod.ps1,serve-direct.cmd}
#
# It never touches apps\server\data (records, images, users.json).
#
# Usage:
#   pwsh -File scripts\make-hotfix.ps1 [-Notes "本次改了什么"]
#   pnpm hotfix
param(
  [string]$Out = '',
  [string]$Notes = ''
)
$ErrorActionPreference = 'Stop'
$enc936 = [System.Text.Encoding]::GetEncoding(936)

# Get-FileHash 属于 Microsoft.PowerShell.Utility，靠模块自动加载；在模块路径被裁剪的
# 受限环境里会报 CommandNotFound，这里直接用 .NET 算，行为一致且不依赖模块。
function Get-Sha256Hex([string]$Path) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $fs = [System.IO.File]::OpenRead($Path)
    try { $bytes = $sha.ComputeHash($fs) } finally { $fs.Dispose() }
  } finally { $sha.Dispose() }
  return ([BitConverter]::ToString($bytes)).Replace('-', '')
}

$repo = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path (Split-Path -Parent $repo) 'Maintenance-Records-hotfix' }
$release = Join-Path (Split-Path -Parent $repo) 'Maintenance-Records-release'

$bundleSrc = Join-Path $release 'apps\server\dist\index.cjs'
if (-not (Test-Path $bundleSrc)) {
  throw "找不到发布包 bundle：$bundleSrc（先运行 pnpm release 生成发布包）"
}

if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$payload = Join-Path $Out 'payload'
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'apps\server\dist') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'apps\web\dist') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'scripts') | Out-Null

Copy-Item $bundleSrc (Join-Path $payload 'apps\server\dist\index.cjs') -Force
Copy-Item (Join-Path $release 'apps\web\dist\index.html') (Join-Path $payload 'apps\web\dist\index.html') -Force
Copy-Item (Join-Path $release 'apps\web\dist\assets') (Join-Path $payload 'apps\web\dist\assets') -Recurse -Force
Copy-Item (Join-Path $release 'scripts\start-prod.ps1') (Join-Path $payload 'scripts\start-prod.ps1') -Force
Copy-Item (Join-Path $release 'scripts\serve-direct.cmd') (Join-Path $payload 'scripts\serve-direct.cmd') -Force

# 应用脚本已经按 GBK 存好，直接复制字节（不要用文本读写，避免编码来回转）。
Copy-Item (Join-Path $PSScriptRoot 'hotfix\应用热更新.bat') (Join-Path $Out '应用热更新.bat') -Force

if (-not $Notes) { $Notes = '见 README 的更新记录。' }
$readme = @"
维修记录系统 - 热更新包
生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm')

本次更新内容
------------
$Notes

怎么用（推荐：整个 hotfix 文件夹放进发布包目录）
------------------------------------------------
1. 把整个 hotfix 文件夹复制到发布包目录里，和「启动服务.bat」同级。
2. 双击 hotfix 文件夹里的「应用热更新.bat」。
3. 脚本会：停止服务 → 覆盖服务端程序 / 前端页面 / 启动脚本 → 重新启动服务。
   全程不会碰 apps\server\data（维修记录、图片、账号都在里面）。
4. 同事的浏览器按一次 Ctrl+F5 强制刷新。

也可以不复制文件夹：直接双击「应用热更新.bat」，按提示把发布包文件夹的完整路径
粘进去（例如 Z:\模具中心\...\Maintenance-Records-release）。

注意事项
--------
- 应用前建议先双击「停止服务.bat」，虽然脚本会自己停，但手工停一次更稳。
- 如果提示「文件覆盖失败 / index.cjs 被占用」，说明服务没停干净：
  关掉所有维修记录的窗口，再双击「停止服务.bat」，然后重试。
- 热更新不会修改 apps\server\data\users.json，账号和密码都保留。
- 更新后如果同事说「按钮还是老样子」，让他 Ctrl+F5；旧标签页可能还跑着老的 JS。
"@
$readme = ($readme -replace "`r`n", "`n") -replace "`n", "`r`n"
[IO.File]::WriteAllText((Join-Path $Out '说明.txt'), $readme, $enc936)

$bundle = Get-Item (Join-Path $payload 'apps\server\dist\index.cjs')
$hash = Get-Sha256Hex $bundle.FullName
$total = (Get-ChildItem $Out -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host "hotfix ready: $Out"
Write-Host ("  server bundle: {0:N1} MB  sha256={1}" -f ($bundle.Length / 1MB), $hash.Substring(0, 16))
Write-Host ("  total: {0:N1} MB" -f ($total / 1MB))
