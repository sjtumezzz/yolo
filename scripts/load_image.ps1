param(
    [string]$ImageTar = "dist\yolo-workbench-backend.tar"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Test-Path -LiteralPath $ImageTar)) {
    throw "Image tar file not found: $ImageTar"
}

docker load -i $ImageTar
Write-Host "Loaded Docker image from $ImageTar"
