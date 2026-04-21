$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

docker compose ps
Write-Host ""
Write-Host "Health endpoint:"
$port = if ($env:YOLO_BACKEND_PORT) { $env:YOLO_BACKEND_PORT } else { "5001" }
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3
    Write-Host ""
    Write-Host "Info endpoint:"
    Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/info" -TimeoutSec 3
} catch {
    Write-Host "Backend is not reachable yet."
}
