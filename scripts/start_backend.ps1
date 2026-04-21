param(
    [switch]$Build,
    [switch]$Gpu,
    [string]$ImageTar = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Test-Command($Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "docker")) {
    throw "Docker is not installed or not available in PATH."
}

docker info | Out-Null

if ($ImageTar) {
    if (-not (Test-Path -LiteralPath $ImageTar)) {
        throw "Image tar file not found: $ImageTar"
    }
    docker load -i $ImageTar
}

if ($Gpu) {
    if (-not (Test-Command "nvidia-smi")) {
        throw "nvidia-smi is not available. Install NVIDIA driver before using -Gpu."
    }
    nvidia-smi | Out-Null
}

$dataDir = if ($env:YOLO_APP_DATA) { $env:YOLO_APP_DATA } else { "annotation_data" }
$runsDir = if ($env:YOLO_APP_RUNS) { $env:YOLO_APP_RUNS } else { "runs" }
$weightsDir = if ($env:YOLO_APP_WEIGHTS) { $env:YOLO_APP_WEIGHTS } else { "weights" }
$logsDir = if ($env:YOLO_APP_LOGS) { $env:YOLO_APP_LOGS } else { "logs" }

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $runsDir | Out-Null
New-Item -ItemType Directory -Force -Path $weightsDir | Out-Null
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$composeArgs = @("compose", "-f", "docker-compose.yml")
if ($Gpu) {
    $composeArgs += @("-f", "docker-compose.gpu.yml")
}
$composeArgs += @("up")

if ($Build) {
    $composeArgs += "--build"
} else {
    $composeArgs += "--no-build"
}
$composeArgs += "-d"

docker @composeArgs

$port = if ($env:YOLO_BACKEND_PORT) { $env:YOLO_BACKEND_PORT } else { "5001" }
$healthUrl = "http://127.0.0.1:$port/api/health"

Write-Host "YOLO Workbench backend is starting at $healthUrl"
for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3 | Out-Null
        Write-Host "Backend health check passed."
        exit 0
    } catch {
        Start-Sleep -Seconds 2
    }
}

throw "Backend did not pass health check in time. Run scripts\\status_backend.ps1 for details."
