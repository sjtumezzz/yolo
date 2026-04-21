# Docker Backend Guide

This document fixes the backend packaging plan for YOLO Workbench.

## Architecture

The Docker container is a long-running local backend service. The desktop exe should not run training or inference directly. It should call the backend HTTP API at:

```text
http://127.0.0.1:5001
```

The current implementation uses Flask + Gunicorn. FastAPI is also a reasonable choice, but switching frameworks is not required because the existing service already exposes REST APIs and asynchronous task polling.

Current task pattern:

- Training: create a task, receive a task id, poll task status and logs.
- Inference: create a task, receive a task id, poll task status and logs.
- Health: call `/api/health`.
- Runtime info: call `/api/info`.

## Security Boundary

Docker Compose binds the backend to localhost only:

```yaml
127.0.0.1:5001:5001
```

This prevents direct access from other LAN machines by default.

An optional API key can also be enabled:

```powershell
$env:YOLO_API_KEY="change-this-token"
```

When `YOLO_API_KEY` is set, API requests must include:

```text
X-API-Key: change-this-token
```

`/api/health` and `/api/info` remain public so the exe can diagnose startup problems clearly.

## Mounted Directories

Runtime data is exchanged through mounted directories, not large HTTP payloads:

```text
annotation_data/ -> /app/annotation_data
runs/            -> /app/runs
weights/         -> /app/weights
logs/            -> /app/logs
```

These can be overridden with environment variables:

```text
YOLO_APP_DATA
YOLO_APP_RUNS
YOLO_APP_WEIGHTS
YOLO_APP_LOGS
```

Recommended customer install layout:

```text
C:\YoloApp\data
C:\YoloApp\runs
C:\YoloApp\weights
C:\YoloApp\logs
```

Logs are written under `logs/training/` and `logs/inference/`, so customers can send log files without entering the container.

## Start Backend

Build and start CPU backend:

```powershell
.\scripts\start_backend.ps1 -Build
```

Start from an existing image:

```powershell
.\scripts\start_backend.ps1
```

Start GPU backend:

```powershell
.\scripts\start_backend.ps1 -Gpu -Build
```

Stop:

```powershell
.\scripts\stop_backend.ps1
```

Status and diagnostics:

```powershell
.\scripts\status_backend.ps1
```

## GPU Deployment

GPU support uses:

```text
Dockerfile.gpu
docker-compose.gpu.yml
```

The GPU image is based on CUDA 11.8. The host NVIDIA driver must support CUDA 11.8 or newer runtime compatibility. For production delivery, verify the target machine with:

```powershell
.\scripts\check_gpu.ps1
```

Required customer-side components:

- NVIDIA driver
- Docker Desktop
- NVIDIA Container Toolkit or Docker Desktop GPU support
- WSL2 backend enabled on Windows Docker Desktop

If GPU verification fails, use CPU mode first and resolve driver/container runtime issues separately.

## Offline Delivery

Build the image on a development machine, then export it:

```powershell
.\scripts\start_backend.ps1 -Build
.\scripts\save_image.ps1 -Output dist\yolo-workbench-backend.tar
```

On the customer machine:

```powershell
.\scripts\load_image.ps1 -ImageTar dist\yolo-workbench-backend.tar
.\scripts\start_backend.ps1
```

For GPU delivery, build with `-Gpu -Build` and save the `yolo-workbench-backend:gpu` image:

```powershell
.\scripts\save_image.ps1 -Image yolo-workbench-backend:gpu -Output dist\yolo-workbench-backend-gpu.tar
```

## Exe Lifecycle Requirements

The future desktop exe should:

- Call `/api/health` at startup.
- Call `/api/info` and show backend version and GPU availability.
- Show a clear message if Docker backend is not running.
- Provide buttons for start, stop, restart, and status.
- Tell users that closing the exe does not stop a running training task.
- Poll task status and logs instead of waiting for long HTTP requests.

## Notes

Weight files and customer datasets are runtime assets. Do not commit them to GitHub. Put shared weights under `weights/` and let training or inference select them from the UI.
