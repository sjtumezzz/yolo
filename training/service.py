import glob
import os
import sqlite3
import subprocess
import sys
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from signal import SIGTERM


class TrainingService:
    def __init__(self, root_dir: str):
        self.root_dir = Path(root_dir)
        self.data_dir = self.root_dir / "annotation_data"
        self.task_dir = self.data_dir / "training_tasks"
        self.log_dir = Path(os.environ.get("YOLO_LOG_DIR", self.root_dir / "logs")) / "training"
        self.db_path = self.data_dir / "training.db"
        self.processes = {}

        self.task_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self):
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS training_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    dataset_yaml TEXT NOT NULL,
                    weights TEXT NOT NULL,
                    model_cfg TEXT NOT NULL,
                    epochs INTEGER NOT NULL,
                    batch_size INTEGER NOT NULL,
                    img_size INTEGER NOT NULL,
                    device TEXT NOT NULL DEFAULT '',
                    resume INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    command TEXT NOT NULL,
                    output_dir TEXT NOT NULL,
                    log_file TEXT NOT NULL,
                    best_weight TEXT,
                    last_weight TEXT,
                    error_message TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT
                );
                """
            )

    def _now(self):
        return datetime.utcnow().isoformat(timespec="seconds") + "Z"

    def _row_to_dict(self, row):
        return dict(row) if row else None

    def list_dataset_options(self):
        options = []
        export_root = self.root_dir / "annotation_data" / "exports"
        if export_root.exists():
            for yaml_path in sorted(export_root.rglob("data.yaml"), reverse=True):
                options.append(
                    {
                        "label": yaml_path.parent.name,
                        "path": str(yaml_path.resolve()),
                        "source": "annotation_export",
                    }
                )
        for yaml_path in sorted((self.root_dir / "data").glob("*.yaml")):
            options.append(
                {
                    "label": yaml_path.name,
                    "path": str(yaml_path.resolve()),
                    "source": "builtin",
                }
            )
        return options

    def list_weight_options(self):
        seen = set()
        options = []

        def add_path(path: Path, source: str):
            resolved = str(path.resolve())
            if resolved in seen:
                return
            seen.add(resolved)
            options.append(
                {
                    "label": path.name,
                    "path": resolved,
                    "source": source,
                }
            )

        for path in sorted(self.root_dir.glob("*.pt")):
            add_path(path, "root")
        for path in sorted((self.root_dir / "weights").glob("*.pt")):
            add_path(path, "weights")
        for path in sorted((self.root_dir / "runs").rglob("*.pt"), reverse=True):
            add_path(path, "runs")
        return options

    def list_model_options(self):
        return [
            {"label": path.name, "path": str(path.resolve())}
            for path in sorted((self.root_dir / "models").glob("*.yaml"))
        ]

    def get_options(self):
        return {
            "datasets": self.list_dataset_options(),
            "weights": self.list_weight_options(),
            "models": self.list_model_options(),
            "defaults": {
                "epochs": 100,
                "batch_size": 8,
                "img_size": 640,
                "device": "",
                "resume": False,
            },
        }

    def _predict_output_dir(self, task_name: str):
        base = self.root_dir / "runs" / "training_ui" / "exp"
        matches = sorted(glob.glob(str(base) + "*"))
        next_index = 0
        if matches:
            next_index = max(
                int(match[len(str(base)): match.find("_", len(str(base))) if "_" in match[len(str(base)):] else None])
                for match in matches
            ) + 1
        suffix = f"_{task_name}" if task_name else ""
        return str(Path(f"{base}{next_index}{suffix}").resolve())

    def _resolve_best_last(self, output_dir: str):
        weights_dir = Path(output_dir) / "weights"
        best = weights_dir / "best.pt"
        last = weights_dir / "last.pt"
        return str(best), str(last)

    def _artifact_paths(self, output_dir: str):
        output = Path(output_dir)
        return {
            "results_txt": str((output / "results.txt").resolve()),
            "results_png": str((output / "results.png").resolve()),
            "hyp_yaml": str((output / "hyp.yaml").resolve()),
            "opt_yaml": str((output / "opt.yaml").resolve()),
        }

    def create_task(self, payload):
        name = (payload.get("name") or "").strip() or datetime.utcnow().strftime("train_%Y%m%d_%H%M%S")
        dataset_yaml = str(Path(payload["dataset_yaml"]).resolve())
        weights = str(Path(payload["weights"]).resolve())
        model_cfg = str(Path(payload["model_cfg"]).resolve())
        epochs = int(payload.get("epochs", 100))
        batch_size = int(payload.get("batch_size", 8))
        img_size = int(payload.get("img_size", 640))
        device = str(payload.get("device", ""))
        resume = bool(payload.get("resume", False))

        if not Path(dataset_yaml).exists():
            raise ValueError("dataset_yaml not found")
        if not Path(weights).exists():
            raise ValueError("weights file not found")
        if not Path(model_cfg).exists():
            raise ValueError("model_cfg not found")

        output_dir = self._predict_output_dir(name)
        task_path = self.task_dir / name
        task_path.mkdir(parents=True, exist_ok=True)
        log_file = self.log_dir / f"{name}.log"
        best_weight, last_weight = self._resolve_best_last(output_dir)

        command = [
            sys.executable,
            "train.py",
            "--data",
            dataset_yaml,
            "--weights",
            weights,
            "--cfg",
            model_cfg,
            "--epochs",
            str(epochs),
            "--batch-size",
            str(batch_size),
            "--img-size",
            str(img_size),
            str(img_size),
            "--logdir",
            str((self.root_dir / "runs" / "training_ui").resolve()),
            "--name",
            name,
        ]
        if device:
            command.extend(["--device", device])
        if resume:
            command.append("--resume")

        now = self._now()
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO training_tasks(
                    name, dataset_yaml, weights, model_cfg, epochs, batch_size, img_size,
                    device, resume, status, command, output_dir, log_file, best_weight, last_weight,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    dataset_yaml,
                    weights,
                    model_cfg,
                    epochs,
                    batch_size,
                    img_size,
                    device,
                    1 if resume else 0,
                    subprocess.list2cmdline(command),
                    output_dir,
                    str(log_file.resolve()),
                    best_weight,
                    last_weight,
                    now,
                    now,
                ),
            )
            task_id = cursor.lastrowid

        self.start_task(task_id)
        return self.get_task(task_id)

    def start_task(self, task_id: int):
        task = self.get_task(task_id, refresh=False)
        if not task:
            raise ValueError("task not found")
        if task["status"] == "running":
            return task

        command = subprocess.list2cmdline([task["command"]])
        del command  # guard against accidental reuse
        parsed_command = task["command"]

        log_path = Path(task["log_file"])
        log_path.parent.mkdir(parents=True, exist_ok=True)

        started_at = self._now()
        with open(log_path, "a", encoding="utf-8") as handle:
            process = subprocess.Popen(
                parsed_command,
                cwd=str(self.root_dir),
                stdout=handle,
                stderr=subprocess.STDOUT,
                shell=True,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )

        self.processes[task_id] = process
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE training_tasks
                SET status = 'running', started_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (started_at, started_at, task_id),
            )
        return self.get_task(task_id, refresh=False)

    def _poll_task(self, task):
        task_id = task["id"]
        process = self.processes.get(task_id)
        if not process:
            return task
        code = process.poll()
        if code is None:
            return task

        finished_at = self._now()
        status = "completed" if code == 0 else "failed"
        best_exists = Path(task["best_weight"]).exists()
        last_exists = Path(task["last_weight"]).exists()
        error_message = "" if code == 0 else f"training process exited with code {code}"

        with self.connect() as conn:
            conn.execute(
                """
                UPDATE training_tasks
                SET status = ?, finished_at = ?, updated_at = ?, error_message = ?,
                    best_weight = ?, last_weight = ?
                WHERE id = ?
                """,
                (
                    status,
                    finished_at,
                    finished_at,
                    error_message,
                    task["best_weight"] if best_exists else "",
                    task["last_weight"] if last_exists else "",
                    task_id,
                ),
            )
        self.processes.pop(task_id, None)
        return self.get_task(task_id, refresh=False)

    def get_task(self, task_id: int, refresh: bool = True):
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM training_tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return None
        task = self._row_to_dict(row)
        if refresh:
            task = self._poll_task(task)
        task["best_exists"] = bool(task.get("best_weight")) and Path(task["best_weight"]).exists()
        task["last_exists"] = bool(task.get("last_weight")) and Path(task["last_weight"]).exists()
        task["artifacts"] = self._artifact_paths(task["output_dir"])
        task["artifact_exists"] = {
            key: Path(path).exists()
            for key, path in task["artifacts"].items()
        }
        return task

    def list_tasks(self):
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM training_tasks ORDER BY created_at DESC, id DESC"
            ).fetchall()
        return [self.get_task(row["id"]) for row in rows]

    def read_log(self, task_id: int, tail_lines: int = 200):
        task = self.get_task(task_id)
        if not task:
            return None
        log_path = Path(task["log_file"])
        if not log_path.exists():
            return {"task_id": task_id, "lines": [], "path": str(log_path)}
        lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        return {
            "task_id": task_id,
            "path": str(log_path),
            "lines": lines[-tail_lines:],
        }

    def stop_task(self, task_id: int):
        task = self.get_task(task_id, refresh=False)
        if not task:
            return None
        process = self.processes.get(task_id)
        if not process:
            if task["status"] in {"completed", "failed", "stopped"}:
                return self.get_task(task_id)
            return task

        try:
            process.terminate()
        except OSError:
            pass

        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
            except OSError:
                pass
            process.wait(timeout=5)

        finished_at = self._now()
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE training_tasks
                SET status = 'stopped', finished_at = ?, updated_at = ?, error_message = ?
                WHERE id = ?
                """,
                (finished_at, finished_at, "stopped by user", task_id),
            )
        self.processes.pop(task_id, None)
        return self.get_task(task_id, refresh=False)
