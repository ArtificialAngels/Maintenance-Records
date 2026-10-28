# Maintenance Records - production build
# Builds the frontend (vite -> apps/web/dist) and the server (tsc -> apps/server/dist).
# In production the Fastify server serves the frontend from the same origin.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

# Node 的 ESM 无法从 \\ UNC 路径运行（ERR_INVALID_FILE_URL_PATH）。
# 请先在本地磁盘完成构建，或把项目拷回本地运行。
if ($root -like '\\*') {
  throw '项目在共享盘（UNC 路径）上：请在本地磁盘运行构建，再把 dist 产物连同目录一起拷回共享盘。'
}
$arch = if ([Environment]::Is64BitOperatingSystem) { 'win-x64' } else { 'win-x86' }
$node = Join-Path $root "node-runtime\$arch\node.exe"
if (-not (Test-Path $node)) {
  $sys = Get-Command node -ErrorAction SilentlyContinue
  if ($sys) { $node = $sys.Source } else {
    throw 'Node not found. Run "pwsh scripts/setup-runtime.ps1" first, or install Node.js 20+.'
  }
}
$pnpm = Join-Path $root 'node-runtime\tools\pnpm.exe'

Write-Host '==> Building web (apps/web)...'
Push-Location (Join-Path $root 'apps\web')
try {
  if (Test-Path $pnpm) {
    & $pnpm run build
  } else {
    & $node (Join-Path $root 'node_modules\vite\bin\vite.js') build
  }
  if ($LASTEXITCODE -ne 0) { throw 'web build failed' }
} finally { Pop-Location }

Write-Host '==> Building server (apps/server)...'
Push-Location (Join-Path $root 'apps\server')
try {
  if (Test-Path $pnpm) {
    & $pnpm run build
  } else {
    & $node (Join-Path $root 'node_modules\typescript\bin\tsc') -p tsconfig.json
  }
  if ($LASTEXITCODE -ne 0) { throw 'server build failed' }
} finally { Pop-Location }

if (-not (Test-Path (Join-Path $root 'apps\web\dist\index.html'))) {
  throw 'apps/web/dist/index.html missing after build'
}
if (-not (Test-Path (Join-Path $root 'apps\server\dist\index.js'))) {
  throw 'apps/server/dist/index.js missing after build'
}

# dist\index.cjs 是「发布包」专用产物（make-release 用 esbuild 生成）。
# 源码重建后必须删掉旧的 bundle：启动脚本优先加载 .cjs，留着它就会跑旧代码，
# 表现成「界面上的功能没反应 / 改了没用」。
foreach ($stale in @('apps\server\dist\index.cjs', 'apps\server\dist\index.bundle.js')) {
  $stalePath = Join-Path $root $stale
  if (Test-Path $stalePath) {
    Remove-Item $stalePath -Force
    Write-Host "  removed stale release bundle: $stale"
  }
}
Write-Host '==> Production build complete.' -ForegroundColor Green
