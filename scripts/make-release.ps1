# Maintenance Records - assemble a slim, standalone production release.
#
# The release ships a BUNDLED server instead of node_modules:
#
#   <out>\apps\server\dist\index.cjs             single-file server (~4.7 MB)
#   <out>\apps\server\dist\cli\set-password.cjs  bundled password CLI
#   <out>\apps\server\package.json               module type for the folder
#   <out>\apps\web\dist\                         built frontend (same-origin)
#   <out>\node-runtime\win-x64\node.exe          portable runtime (94 MB)
#   <out>\scripts\{start-prod,stop-prod}.ps1, uncroot.cmd, serve-direct.cmd
#   <out>\启动服务.bat / 停止服务.bat / 设置密码.bat / 诊断.bat
#
# Why bundle: the runtime dependency closure (fastify, socket.io, xlsx,
# zod, ...) is ~40 MB as a node_modules tree. esbuild inlines it into one
# ~4.7 MB file, so the release no longer needs node_modules at all and
# cannot suffer from pnpm symlinks when copied to a NAS share.
#
# Build-only tools (typescript, vite, eslint, prettier, tsx, ...) never ship.
# Rebuilding inside the release is not supported - use the dev repo.
param(
  [string]$Out = '',
  [switch]$SkipBuild,
  [switch]$NoBundle
)
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot

# Node 的 ESM 无法从 \\ UNC 路径运行；在本机生成发布包，产出物再拷去共享盘。
if ($repo -like '\\*') {
  throw '项目在共享盘（UNC 路径）上：请在本地磁盘生成发布包，再把 release 目录拷回共享盘。'
}

if (-not $Out) {
  $Out = Join-Path (Split-Path -Parent $repo) 'Maintenance-Records-release'
}

# 1. Ensure fresh build artifacts (server tsc + web vite).
if (-not $SkipBuild) {
  & (Join-Path $PSScriptRoot 'build-prod.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'production build failed' }
}

$serverEntry = Join-Path $repo 'apps\server\dist\index.js'
$webIndex = Join-Path $repo 'apps\web\dist\index.html'
if (-not (Test-Path $serverEntry) -or -not (Test-Path $webIndex)) {
  throw 'dist missing; run scripts/build-prod.ps1 first (or drop -SkipBuild).'
}

$node = Join-Path $repo 'node-runtime\win-x64\node.exe'
if (-not (Test-Path $node)) { throw 'node-runtime\win-x64\node.exe missing' }

# 2. Clean output, but PRESERVE an existing production data directory
#    (re-generating a release must not wipe live data).
#    Data is moved to %TEMP% first and put back in a finally block: even if the
#    cleanup fails, the data must never be left stranded outside the release.
$dataKeep = $null
$liveData = Join-Path $Out 'apps\server\data'
if (Test-Path $liveData) {
  $dataKeep = Join-Path ([IO.Path]::GetTempPath()) ("mr-data-" + [guid]::NewGuid().ToString('N'))
  Move-Item $liveData $dataKeep -Force
}
try {
  # A running release server holds the directory open; fail with a clear hint
  # instead of a cryptic "file in use" from Remove-Item.
  $livePidFile = Join-Path $Out '.run\server-prod.pid'
  if (Test-Path $livePidFile) {
    $livePid = 0
    if ([int]::TryParse(((Get-Content $livePidFile -Raw -ErrorAction SilentlyContinue) -as [string]).Trim(), [ref]$livePid)) {
      if (Get-Process -Id $livePid -ErrorAction SilentlyContinue) {
        throw "发布包里的服务正在运行（PID $livePid）：请先双击 `"$Out\停止服务.bat`"，再重新生成发布包。"
      }
    }
  }

  if (Test-Path $Out) {
    # Retry: antivirus/indexer/Explorer can hold the folder for a moment.
    for ($attempt = 1; ; $attempt++) {
      try {
        Remove-Item $Out -Recurse -Force -ErrorAction Stop
        break
      } catch {
        if ($attempt -ge 5) {
          throw ("无法清空旧发布目录 $Out：$($_.Exception.Message)`n" +
            '常见原因：资源管理器窗口正打开该目录，或残留的服务窗口/进程占着目录。关掉后重试。')
        }
        Start-Sleep -Milliseconds 500
      }
    }
  }
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
} finally {
  if ($dataKeep) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Out 'apps\server') | Out-Null
    Move-Item $dataKeep (Join-Path $Out 'apps\server\data') -Force
  }
}

function Copy-Tree([string]$src, [string]$dst) {
  if (-not (Test-Path $src)) { throw "missing source: $src" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item $src $dst -Recurse -Force
}

$serverOut = Join-Path $Out 'apps\server'
New-Item -ItemType Directory -Force -Path (Join-Path $serverOut 'dist\cli') | Out-Null
Copy-Item (Join-Path $repo 'apps\server\package.json') (Join-Path $serverOut 'package.json') -Force
Copy-Tree (Join-Path $repo 'apps\web\dist') (Join-Path $Out 'apps\web\dist')

# 3. Bundle the server + the password CLI (single files, no node_modules).
if ($NoBundle) {
  Copy-Tree (Join-Path $repo 'apps\server\dist') (Join-Path $serverOut 'dist')
  Write-Host '  (NoBundle: copied plain tsc output; node_modules NOT included - dev repo only!)'
} else {
  $esbuild = Join-Path $repo 'node_modules\esbuild\bin\esbuild'
  if (-not (Test-Path $esbuild)) { throw 'esbuild not found; run pnpm install first' }

  function Invoke-Bundle([string]$entry, [string]$outFile) {
    & $node $esbuild $entry `
      --bundle --platform=node --format=cjs --target=node20 `
      `--external:bufferutil --external:utf-8-validate `
      --outfile=$outFile --log-level=error
    if ($LASTEXITCODE -ne 0) { throw "bundle failed: $entry" }
  }

  Invoke-Bundle (Join-Path $repo 'apps\server\src\index.ts') (Join-Path $serverOut 'dist\index.cjs')
  Invoke-Bundle (Join-Path $repo 'apps\server\src\cli\set-password.ts') (Join-Path $serverOut 'dist\cli\set-password.cjs')
}

# 4. Portable Node runtime (node.exe only; pnpm.exe not needed at runtime).
New-Item -ItemType Directory -Force -Path (Join-Path $Out 'node-runtime\win-x64') | Out-Null
Copy-Item (Join-Path $repo 'node-runtime\win-x64\node.exe') (Join-Path $Out 'node-runtime\win-x64\node.exe') -Force
Copy-Item (Join-Path $repo 'node-runtime\VERSION.json') (Join-Path $Out 'node-runtime\VERSION.json') -Force

# 5. Launchers (UNC shared-drive bootstrap included) + stop/admin scripts.
foreach ($f in @('start-prod.ps1', 'stop-prod.ps1', 'uncroot.cmd', 'serve-direct.cmd')) {
  $dst = Join-Path $Out "scripts\$f"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item (Join-Path $repo "scripts\$f") $dst -Force
}
foreach ($f in @('启动服务.bat', '停止服务.bat', '设置密码.bat', '诊断.bat', '开放防火墙.bat')) {
  Copy-Item (Join-Path $repo $f) (Join-Path $Out $f) -Force
}

# 6. Report.
$distMb = [math]::Round((Get-ChildItem (Join-Path $serverOut 'dist') -Recurse -Force | Measure-Object Length -Sum).Sum / 1MB, 1)
$totalMb = [math]::Round((Get-ChildItem $Out -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "release ready: $Out" -ForegroundColor Green
Write-Host "  server bundle: $distMb MB; total: $totalMb MB"
