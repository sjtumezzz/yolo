# Docker Backend Guide

This document defines the fixed backend container plan for YOLO Workbench.

## Goal

The backend should run as a local Docker service and expose the complete web/API workflow at:

```text
http://127.0.0.1:5001
```

The future desktop exe should connect to this URL.

## Service

Docker Compose service:

```text
yolo-backend
```

Container name:

```text
yolo-workbench-backend
```

Image name:

```text
yolo-workbench-backend:latest
```

## Mounted Directories

The backend uses these host directories:

```text
annotation_data/ -> /app/annotation_data
runs/            -> /app/runs
weights/         -> /app/weights
```

Purpose:

- `annotation_data/`: SQLite databases, uploaded files, exported datasets, inference inputs/outputs
- `runs/`: training output directories
- `weights/`: manually supplied model weight files

These directories are runtime data and are not committed to Git.

## Start Backend

First build and start:

```powershell
.\scripts\start_backend.ps1 -Build
```

Start after image already exists:

```powershell
.\scripts\start_backend.ps1
```

Stop:

```powershell
.\scripts\stop_backend.ps1
```

Status:

```powershell
.\scripts\status_backend.ps1
```

## Manual Docker Commands

Build and start:

```powershell
docker compose up --build -d
```

Stop:

```powershell
docker compose down
```

View logs:

```powershell
docker compose logs -f yolo-backend
```

## Pages

After startup:

```text
http://127.0.0.1:5001/
http://127.0.0.1:5001/annotation
http://127.0.0.1:5001/training
http://127.0.0.1:5001/inference
```

Health check:

```text
http://127.0.0.1:5001/api/health
```

## Weight Files

Weight files are not committed to GitHub.

Place them in:

```text
weights/
```

Example:

```text
weights/yolov5s.pt
weights/best.pt
```

The training and inference pages scan available `.pt` files from:

- project root
- `weights/`
- `runs/`

For Docker delivery, prefer putting all shared weights under `weights/`.

## CPU and GPU

The current Docker plan is CPU-first.

GPU training inside Docker requires additional setup:

- NVIDIA driver on host
- Docker Desktop GPU support
- NVIDIA Container Toolkit where applicable
- compatible CUDA/PyTorch image strategy

Do not treat GPU Docker support as part of the first stable package unless target machines are verified.

## Notes for exe Packaging

The future exe should:

1. check `http://127.0.0.1:5001/api/health`
2. open `http://127.0.0.1:5001/`
3. show a clear error if backend is not running

The exe should not train or infer directly. It should only be a desktop shell.

