# YOLO Workbench

This project extends a YOLOv5-based codebase into a three-module workflow:

- Annotation
- Training
- Inference

The current goal is to provide a complete local workflow that can later be packaged as:

- Docker for the backend algorithm service
- exe for the frontend client

## Modules

### 1. Annotation

Used to prepare datasets before training.

Current features:

- Create datasets
- Add and delete classes
- Upload images
- Draw, move, resize, and delete bounding boxes
- Save annotations to SQLite
- Export YOLO-format dataset with `images/`, `labels/`, and `data.yaml`

Page:

- `http://127.0.0.1:5001/annotation`

### 2. Training

Used to launch and manage model training tasks.

Current features:

- Select dataset YAML
- Select initial weights
- Select model config
- Set epochs, batch size, image size, and device
- Start training tasks
- View task status
- View training logs
- Stop training tasks
- Download `best.pt`, `last.pt`, and common result files

Page:

- `http://127.0.0.1:5001/training`

### 3. Inference

Used to run file-based inference on images and videos.

Current features:

- Select weights
- Upload one image or video
- Configure confidence, IoU, image size, and device
- Run inference tasks
- View task status
- View logs
- Stop inference tasks
- Preview output image/video
- Download input and output files

Page:

- `http://127.0.0.1:5001/inference`

## Project Entry

Home page:

- `http://127.0.0.1:5001/`

Start the app locally:

```powershell
cd F:\yolov5-3.0\yolov5-3.0
py -3 app.py
```

## Main Structure

```text
annotation/      annotation backend service
training/        training backend service
inference_ui/    inference backend service
templates/       HTML pages
static/          frontend JS/CSS assets
models/          YOLO model configs and model code
utils/           YOLO utility code
data/            dataset configs and hyperparameters
weights/         local pretrained weights
```

## Data and Runtime Files

Runtime data is written under:

```text
annotation_data/
```

This directory stores:

- SQLite databases
- uploaded files
- exported datasets
- task logs
- inference outputs

These files are intentionally ignored by Git.

## Git Workflow

Recommended branch for current UI/workbench development:

- `codex/ui-workbench`

Basic collaboration flow:

```powershell
git fetch origin
git checkout codex/ui-workbench
git pull
```

Create your own feature branch from it when needed.

## Docker

Current Docker files:

- `Dockerfile`
- `Dockerfile.gpu`
- `docker-compose.yml`
- `docker-compose.gpu.yml`
- `DOCKER_BACKEND.md`

Run CPU backend with:

```powershell
.\scripts\start_backend.ps1 -Build
```

Run GPU backend with:

```powershell
.\scripts\start_backend.ps1 -Gpu -Build
```

For the fixed backend container contract, see `DOCKER_BACKEND.md`.

## Desktop Exe

The desktop shell is in:

```text
desktop/
```

Development run:

```powershell
cd desktop
npm.cmd install
npm.cmd run start
```

Build exe:

```powershell
npm.cmd run dist
```

For the desktop shell contract, see `DESKTOP_APP.md`.

## Notes

- The annotation, training, and inference pages are implemented, but actual training and inference still depend on the local Python environment being complete.
- Large model weights, training outputs, local virtual environments, and runtime-generated files should not be committed directly to GitHub.
