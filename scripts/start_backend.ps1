param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

New-Item -ItemType Directory -Force -Path "annotation_data" | Out-Null
New-Item -ItemType Directory -Force -Path "runs" | Out-Null
New-Item -ItemType Directory -Force -Path "weights" | Out-Null

if ($Build) {
    docker compose up --build -d
} else {
    docker compose up -d
}

Write-Host "YOLO Workbench backend is starting at http://127.0.0.1:5001"
Write-Host "Use scripts\\status_backend.ps1 to check container status."
