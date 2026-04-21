param(
    [string]$Output = "dist\yolo-workbench-backend.tar",
    [string]$Image = "yolo-workbench-backend:latest"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$outputDir = Split-Path -Parent $Output
if ($outputDir) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

docker save -o $Output $Image
Write-Host "Saved $Image to $Output"
