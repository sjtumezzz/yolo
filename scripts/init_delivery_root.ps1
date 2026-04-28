param(
    [string]$Root = "C:\YoloApp"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot

$directories = @(
    $Root,
    (Join-Path $Root "backend"),
    (Join-Path $Root "desktop"),
    (Join-Path $Root "data"),
    (Join-Path $Root "runs"),
    (Join-Path $Root "weights"),
    (Join-Path $Root "logs")
)

foreach ($path in $directories) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
}

$backendRoot = Join-Path $Root "backend"
$filesToCopy = @(
    "docker-compose.yml",
    "docker-compose.gpu.yml",
    "DOCKER_BACKEND.md",
    "README.md"
)

foreach ($relativePath in $filesToCopy) {
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

Write-Host "Delivery root initialized at $Root"
Write-Host "Backend files copied to $backendRoot"
Write-Host "You can now place:"
Write-Host "  - Docker image tar into $backendRoot"
Write-Host "  - packaged desktop app into $(Join-Path $Root 'desktop')"
Write-Host "  - weight files into $(Join-Path $Root 'weights')"
