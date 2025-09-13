param(
  [switch]$ConsoleRelease  # 开启：临时注释 windows_subsystem，让 release 在控制台输出日志
)

$ErrorActionPreference = "Stop"

function Die($msg){ Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# 0) 位置校验
if (!(Test-Path ".\src-tauri\tauri.conf.json")) { Die "请在 pms-web 项目根目录运行本脚本" }

# 1) 结束可能占用的进程 & 释放旧文件
Write-Host ">> Kill running pms-web.exe if any..." -ForegroundColor Yellow
& taskkill /IM pms-web.exe /F 2>$null | Out-Null
Stop-Process -Name pms-web -Force -ErrorAction SilentlyContinue

# 2) 检查/安装 WebView2（缺它 release 可能直接打不开）
Write-Host ">> Check WebView2 runtime..." -ForegroundColor Yellow
$wv2 = (winget list --id Microsoft.EdgeWebView2Runtime 2>$null | Out-String)
if (-not $wv2.Trim()) {
  Write-Host "   Installing WebView2..." -ForegroundColor Yellow
  winget install -e --id Microsoft.EdgeWebView2Runtime --accept-package-agreements --accept-source-agreements
}

# 3) （可选）临时开启发布版控制台：注释 windows_subsystem
$Main = "src-tauri\src\main.rs"
$Backup = "src-tauri\src\main.rs.bak_buildrun"
$Marker = "#![cfg_attr(not(debug_assertions), windows_subsystem = ""windows"")]"
$Pat = '^\s*#!\[cfg_attr\(not\(debug_assertions\)\),\s*windows_subsystem\s*=\s*"windows"\)\]\s*$'
$DidPatch = $false
if ($ConsoleRelease) {
  if (Test-Path $Main) {
    Copy-Item $Main $Backup -Force
    $content = Get-Content $Main
    $new = $content -replace $Pat, '// \0'
    Set-Content $Main $new -Encoding utf8
    $DidPatch = $true
    Write-Host ">> Enabled console for release (temporary)." -ForegroundColor Green
  }
}

# 4) 确保 pnpm 可用
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  try { corepack enable; corepack prepare pnpm@latest --activate } catch { Die "pnpm 不可用，请先安装 Node LTS 并启用 corepack" }
}

# 5) 打前端
Write-Host ">> Building frontend (pnpm build)..." -ForegroundColor Yellow
pnpm build

# 6) 清掉旧 exe（避免 os error 5）
Remove-Item ".\src-tauri\target\release\pms-web.exe" -Force -ErrorAction SilentlyContinue

# 7) 打包 Tauri（必要时切换新的 target 目录以绕过锁文件）
Write-Host ">> Building Tauri release..." -ForegroundColor Yellow
try {
  pnpm tauri build
} catch {
  Write-Host "!! build failed once, retry with a fresh target dir..." -ForegroundColor Yellow
  $env:CARGO_TARGET_DIR = "$PWD\.cargo-target"
  pnpm tauri build
}

# 8) 运行（带日志环境变量）
Write-Host ">> Running release exe..." -ForegroundColor Yellow
$exeA = ".\src-tauri\target\release\pms-web.exe"
$exeB = ".\.cargo-target\release\pms-web.exe"
$exe = if (Test-Path $exeA) { $exeA } elseif (Test-Path $exeB) { $exeB } else { $null }
if (-not $exe) { 
  if ($DidPatch -and (Test-Path $Backup)) { Move-Item $Backup $Main -Force }
  Die "未找到生成的 pms-web.exe"
}

# 打开详细日志（若是 ConsoleRelease，会在当前终端输出；否则仅方便排错）
$env:RUST_BACKTRACE = "1"
$env:RUST_LOG = "tauri=trace,tao=info,wry=info"

# 在当前窗口运行，便于看到输出（Ctrl+C 可结束）
& $exe

# 9) 收尾：恢复源码
if ($DidPatch -and (Test-Path $Backup)) {
  Move-Item $Backup $Main -Force
  Write-Host ">> main.rs restored." -ForegroundColor Green
}
