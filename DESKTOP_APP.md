# Desktop Exe Guide

This document describes the first desktop exe shell for YOLO Workbench.

## Role

The desktop app is a management shell. It does not run YOLO training or inference directly.

It is responsible for:

- checking whether the Docker backend is running
- starting, stopping, and restarting the backend through PowerShell scripts
- opening the web workbench at `http://127.0.0.1:5001`
- opening the logs directory for troubleshooting
- showing backend health, version, and GPU availability

## Implementation

The desktop shell lives in:

```text
desktop/
```

Main files:

```text
desktop/main.js       Electron main process
desktop/preload.js    safe bridge between UI and main process
desktop/manager.html  service management page
desktop/manager.js    service management UI logic
desktop/manager.css   management page styles
```

## Development Run

Install Node.js first. Then run:

```powershell
cd desktop
npm.cmd install
npm.cmd run start
```

The launcher will check:

```text
http://127.0.0.1:5001/api/health
http://127.0.0.1:5001/api/info
```

If the backend is not running, use the launcher buttons to start it.

## Build Exe

From `desktop/`:

```powershell
npm.cmd install
npm.cmd run dist
```

Build outputs are written to:

```text
desktop/dist/
```

This directory is ignored by Git.

If GitHub release downloads are blocked, use the local Electron runtime mode already configured in `desktop/package.json`. For a quick unpacked verification build, run:

```powershell
npm.cmd run pack
```

## Backend Scripts Used

The exe calls these scripts:

```text
scripts/start_backend.ps1
scripts/stop_backend.ps1
scripts/status_backend.ps1
```

In development mode, scripts are resolved from the repository root.

In packaged mode, scripts are copied as Electron extra resources and resolved from `process.resourcesPath`.

## Environment Variables

Supported variables:

```text
YOLO_BACKEND_PORT
YOLO_BACKEND_URL
YOLO_APP_ROOT
YOLO_APP_LOGS
```

`YOLO_APP_ROOT` is useful when the packaged exe should manage a backend directory outside Electron's resource folder.

## User-Facing Behavior

Closing the exe does not stop training. Training runs inside the Docker backend and should continue until the user stops the task or stops the backend.

The first release intentionally does not install Docker automatically. The customer machine still needs Docker Desktop and, for GPU mode, NVIDIA GPU container support.
