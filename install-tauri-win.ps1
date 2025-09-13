# install-tauri-win.ps1  (ASCII only)

$ErrorActionPreference = "Stop"

function Ensure-Tool($cmd, $install) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    & $install
  }
}

# 0) winget check
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Error "winget not found. Install 'App Installer' from Microsoft Store."; exit 1
}

# 1) Rust/Cargo
Ensure-Tool "cargo" { winget install -e --id Rustlang.Rustup --accept-package-agreements --accept-source-agreements }
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (-not (($env:Path -split ';') -contains $cargoBin)) { $env:Path = "$env:Path;$cargoBin" }

# 2) VS Build Tools (C++ toolchain + Windows SDK + CMake)
winget install -e --id Microsoft.VisualStudio.2022.BuildTools `
  --accept-package-agreements --accept-source-agreements `
  --override "--add Microsoft.VisualStudio.Workload.VCTools;Microsoft.VisualStudio.Component.VC.CMake.Project;Microsoft.VisualStudio.Component.Windows10SDK.22000 --includeRecommended --quiet --norestart --wait"

# 3) WebView2 Runtime
Ensure-Tool "C:\Program Files (x86)\Microsoft\EdgeWebView\Application\msedgewebview2.exe" { winget install -e --id Microsoft.EdgeWebView2Runtime --accept-package-agreements --accept-source-agreements }

# 4) Node.js LTS
Ensure-Tool "node" { winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements }

# 5) pnpm
try { corepack enable; corepack prepare pnpm@latest --activate } catch { npm i -g pnpm }
pnpm -v | Write-Host

# 6) Project deps
pnpm i
pnpm add -D @tauri-apps/cli
pnpm add @tauri-apps/api

# 7) Init tauri if missing
if (-not (Test-Path "src-tauri\tauri.conf.json")) {
  pnpm dlx @tauri-apps/cli init --ci -A
}

# 8) Doctor & dev
pnpm dlx @tauri-apps/cli info
pnpm tauri dev
