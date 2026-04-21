$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

docker compose ps
Write-Host ""
Write-Host "Health endpoint:"
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:5001/api/health" -TimeoutSec 3
} catch {
    Write-Host "Backend is not reachable yet."
}
