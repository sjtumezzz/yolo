# Packaging Plan

This document describes the recommended packaging strategy for this project.

Target delivery form:

- Backend algorithm service: Docker
- Frontend desktop client: exe

The current codebase already contains the three workflow modules:

- Annotation
- Training
- Inference

The packaging goal is to make these modules usable by non-developers without asking them to run Python scripts manually.

## 1. Recommended Architecture

Recommended final structure:

```text
Desktop exe
    |
    | HTTP
    v
Local backend service in Docker
    |
    +-- Annotation API
    +-- Training API
    +-- Inference API
```

### Frontend responsibility

The desktop exe should:

- launch the UI
- connect to `http://127.0.0.1:5001`
- guide users through annotation, training, and inference
- avoid exposing Python commands

### Backend responsibility

The Docker backend should:

- provide all APIs
- manage files and runtime data
- execute training and inference tasks
- store logs, datasets, outputs, and metadata

## 2. Current Project State

Already implemented:

- Flask-based backend and pages
- Annotation module
- Training task module
- Inference task module
- Dockerfile
- docker-compose.yml

Not fully completed for final delivery:

- verified backend Docker runtime on target machines
- unified runtime directory mapping
- desktop exe shell
- startup orchestration between exe and backend
- installer-level user experience

## 3. Backend Docker Plan

### Current backend entry

Current backend app:

- `app.py`

Current pages:

- `/`
- `/annotation`
- `/training`
- `/inference`

Current Docker files:

- `Dockerfile`
- `docker-compose.yml`

### Recommended container behavior

The backend container should:

- expose port `5001`
- mount a persistent host directory for runtime data
- not store datasets and outputs only inside the container filesystem

Recommended mounted host paths:

```text
./annotation_data -> /app/annotation_data
./weights         -> /app/weights
./runs            -> /app/runs
```

This keeps:

- annotation databases
- exported datasets
- training outputs
- inference outputs
- model weights

outside the container image.

### Recommended backend runtime rules

- Code is versioned in Git
- Runtime data stays outside Git
- Large weights are mounted, not baked into Git
- Training and inference outputs are persistent across restarts

### Recommended backend startup command

Current Docker start command:

```text
gunicorn -b 0.0.0.0:5001 app:app
```

This is acceptable for the first release.

If long-running training tasks become unstable under gunicorn worker behavior, consider:

- one worker only
- or a dedicated process manager for background jobs later

## 4. Frontend exe Plan

### Recommended approach

Because the frontend already exists as server-rendered HTML pages, the simplest desktop packaging approach is:

- a thin desktop shell
- open a webview pointing to `http://127.0.0.1:5001`

Recommended implementation options:

1. PyWebView + PyInstaller
2. Tauri
3. Electron

### Recommended first choice

For this project, the recommended first choice is:

- PyWebView + PyInstaller

Reason:

- minimal additional frontend rewrite
- fast to integrate with the current Flask pages
- lighter than Electron
- easier than introducing a full JS desktop stack right now

### What the exe should do

The exe should:

1. check whether backend is reachable on `127.0.0.1:5001`
2. if not reachable, prompt the user to start backend or start Docker backend automatically later
3. open a desktop window wrapping the local web pages
4. hide URL details from end users

### What the exe should not do

- it should not run training logic directly
- it should not own model files internally
- it should not replace the backend container

## 5. Recommended Delivery Modes

### Mode A: Internal lab/dev use

Users install:

- Docker Desktop
- project backend image
- desktop exe

This is the best near-term delivery mode.

### Mode B: End-user simplified delivery

Users install:

- desktop exe
- a helper service or startup script that also manages Docker

This is more polished, but requires more packaging work.

## 6. Directory Contract

To avoid confusion across machines, define a clear runtime contract.

Recommended project-level directories:

```text
weights/                  manually provided model weights
annotation_data/          runtime data
annotation_data/exports/  exported YOLO datasets
runs/                     training outputs
```

Recommended rules:

- Annotation module exports datasets to `annotation_data/exports/`
- Training module reads selected `data.yaml` from exported datasets
- Training outputs go to `runs/training_ui/`
- Inference inputs and outputs stay in `annotation_data/`

## 7. What Teammates Need Locally

### For code development

They need:

- Python environment
- project dependencies
- Git

### For packaged backend usage

They need:

- Docker Desktop
- enough disk space for datasets, outputs, and weights

### For packaged frontend usage

They need:

- the desktop exe

## 8. Packaging Roadmap

### Phase 1: Freeze the backend contract

Tasks:

- verify Docker build on target machine
- verify mounted directories
- verify annotation, training, and inference end-to-end under Docker
- decide how weights are supplied

### Phase 2: Build a desktop shell

Tasks:

- create a small desktop launcher
- open `http://127.0.0.1:5001`
- show backend connection errors clearly

### Phase 3: Startup integration

Tasks:

- detect whether backend is already running
- optionally add a startup helper script
- optionally launch Docker container automatically

### Phase 4: Final delivery

Tasks:

- prepare release instructions
- package backend image
- package desktop exe
- provide weight distribution instructions

## 9. Risks and Constraints

### GPU training in Docker

This is the largest deployment risk.

If target machines require GPU training, they also need:

- NVIDIA drivers
- Docker GPU support
- matching CUDA runtime expectations

For the first packaged release, CPU-only testing is easier, but slower.

### Large model files

Weights should not be committed to GitHub directly.

Recommended distribution methods:

- shared lab storage
- cloud drive
- internal server

### Data privacy

If datasets are sensitive, do not put them into GitHub.

Keep them in mounted local storage only.

## 10. Recommended Next Implementation Steps

The next practical steps should be:

1. verify the fixed Docker backend end-to-end with `scripts/start_backend.ps1 -Build`
2. add a small desktop shell for the existing pages
3. define weight placement instructions
4. prepare a release checklist for teammates

See `DOCKER_BACKEND.md` for the fixed backend container contract.

## 11. Suggested First Release Scope

For the first usable packaged release, include:

- Annotation page
- Training page
- Inference page
- backend Docker service
- desktop exe shell
- README and deployment guide

Do not block release on:

- automatic Docker installation
- auto-download weights
- GPU automation
- installer polish
