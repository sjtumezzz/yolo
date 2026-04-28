param(
    [string]$OutputRoot = "dist\release_bundle",
    [string]$DesktopSource = "desktop\dist\win-unpacked",
    [string]$ImageTar = "",
    [switch]$IncludeGpuCompose
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$bundleRoot = Join-Path $ProjectRoot $OutputRoot
$appRoot = Join-Path $bundleRoot "YoloApp"
$backendRoot = Join-Path $appRoot "backend"
$desktopRoot = Join-Path $appRoot "desktop"

if (Test-Path -LiteralPath $bundleRoot) {
    Remove-Item -LiteralPath $bundleRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $backendRoot | Out-Null
New-Item -ItemType Directory -Force -Path $desktopRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $appRoot "weights") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $appRoot "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $appRoot "runs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $appRoot "logs") | Out-Null

$backendFiles = @(
    "docker-compose.yml",
    "DOCKER_BACKEND.md",
    "README.md",
    "HANDOFF_GUIDE.md"
)

if ($IncludeGpuCompose) {
    $backendFiles += "docker-compose.gpu.yml"
}

foreach ($relativePath in $backendFiles) {
    $sourcePath = Join-Path $ProjectRoot $relativePath
    if (Test-Path -LiteralPath $sourcePath) {
        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $backendRoot (Split-Path $relativePath -Leaf)) -Force
    }
}

$scriptDestination = Join-Path $backendRoot "scripts"
New-Item -ItemType Directory -Force -Path $scriptDestination | Out-Null
Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "scripts") -Filter "*.ps1" | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $scriptDestination $_.Name) -Force
}

$desktopPath = Join-Path $ProjectRoot $DesktopSource
if (Test-Path -LiteralPath $desktopPath) {
    Copy-Item -LiteralPath $desktopPath -Destination $desktopRoot -Recurse -Force
} else {
    Write-Warning "Desktop source not found: $desktopPath"
}

if ($ImageTar) {
    $imageTarPath = if ([System.IO.Path]::IsPathRooted($ImageTar)) { $ImageTar } else { Join-Path $ProjectRoot $ImageTar }
    if (-not (Test-Path -LiteralPath $imageTarPath)) {
        throw "Image tar not found: $imageTarPath"
    }
    Copy-Item -LiteralPath $imageTarPath -Destination (Join-Path $backendRoot (Split-Path $imageTarPath -Leaf)) -Force
}

Write-Host "Release bundle prepared at $appRoot"
