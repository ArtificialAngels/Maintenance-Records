# Maintenance Records - production build
# Builds the frontend (vite -> apps/web/dist) and the server (tsc -> apps/server/dist).
# In production the Fastify server serves the frontend from the same origin.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$arch = if ([Environment]::Is64BitOperatingSystem) { 'win-x64' } else { 'win-x86' }
$node = Join-Path $root "node-runtime\$arch\node.exe"
if (-not (Test-Path $node)) {
  $sys = Get-Command node -ErrorAction SilentlyContinue
  if ($sys) { $node = $sys.Source } else {
    throw 'Node not found. Run "安装便携Node.bat" first, or install Node.js 20+.'
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
Write-Host '==> Production build complete.' -ForegroundColor Green
