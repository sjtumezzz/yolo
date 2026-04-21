$ErrorActionPreference = "Stop"

if (-not (Get-Command "nvidia-smi" -ErrorAction SilentlyContinue)) {
    throw "nvidia-smi is not available. Install or repair the NVIDIA driver first."
}

Write-Host "Host NVIDIA status:"
nvidia-smi

Write-Host ""
Write-Host "Docker GPU test:"
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
