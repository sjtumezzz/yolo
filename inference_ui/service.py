import os
import shutil
import sqlite3
import subprocess
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path


ALLOWED_INPUT_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".bmp", ".webp",
    ".mp4", ".avi", ".mov", ".mkv", ".wmv",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".wmv"}


class InferenceService:
    def __init__(self, root_dir: str):
        self.root_dir = Path(root_dir)
        self.data_dir = self.root_dir / "annotation_data"
        self.upload_dir = self.data_dir / "inference_uploads"
        self.task_dir = self.data_dir / "inference_tasks"
        self.output_root = self.data_dir / "inference_outputs"
        self.log_dir = Path(os.environ.get("YOLO_LOG_DIR", self.root_dir / "logs")) / "inference"
        self.db_path = self.data_dir / "inference.db"
        self.processes = {}

        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.task_dir.mkdir(parents=True, exist_ok=True)
        self.output_root.mkdir(parents=True, exist_ok=True)
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
                CREATE TABLE IF NOT EXISTS inference_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    source_name TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    weights TEXT NOT NULL,
                    img_size INTEGER NOT NULL,
                    conf_thres REAL NOT NULL,
                    iou_thres REAL NOT NULL,
                    device TEXT NOT NULL DEFAULT '',
                    save_txt INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    command TEXT NOT NULL,
                    output_dir TEXT NOT NULL,
                    output_path TEXT NOT NULL,
                    log_file TEXT NOT NULL,
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

    def list_weight_options(self):
        seen = set()
        options = []

        def add_path(path: Path, source: str):
            resolved = str(path.resolve())
            if resolved in seen or not path.exists():
                return
            seen.add(resolved)
            options.append(
                {"label": path.name, "path": resolved, "source": source}
            )

        for path in sorted(self.root_dir.glob("*.pt")):
            add_path(path, "root")
        for path in sorted((self.root_dir / "weights").glob("*.pt")):
            add_path(path, "weights")
        for path in sorted((self.root_dir / "runs").rglob("*.pt"), reverse=True):
            add_path(path, "runs")
        return options

    def get_options(self):
        return {
            "weights": self.list_weight_options(),
            "defaults": {
                "img_size": 640,
                "conf_thres": 0.4,
                "iou_thres": 0.5,
                "device": "cpu",
                "save_txt": False,
            },
        }

    def save_upload(self, file_storage):
        if not file_storage or not file_storage.filename:
            raise ValueError("file is required")
        suffix = Path(file_storage.filename).suffix.lower()
        if suffix not in ALLOWED_INPUT_EXTENSIONS:
            raise ValueError(f"unsupported file type: {suffix}")

        original_name = Path(file_storage.filename).name
        stored_name = f"{uuid.uuid4().hex}{suffix}"
        target = self.upload_dir / stored_name
        file_storage.save(target)
        source_type = "image" if suffix in IMAGE_EXTENSIONS else "video"
        return {
            "original_name": original_name,
            "stored_name": stored_name,
            "path": str(target.resolve()),
            "source_type": source_type,
        }

    def create_task(self, file_storage, payload):
        upload = self.save_upload(file_storage)
        name = (payload.get("name") or "").strip() or f"infer_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        weights = str(Path(payload["weights"]).resolve())
        img_size = int(payload.get("img_size", 640))
        conf_thres = float(payload.get("conf_thres", 0.4))
        iou_thres = float(payload.get("iou_thres", 0.5))
        device = str(payload.get("device", "cpu")).strip()
        save_txt = bool(payload.get("save_txt", False))

        if not Path(weights).exists():
            raise ValueError("weights file not found")

        task_folder = self.task_dir / name
        task_folder.mkdir(parents=True, exist_ok=True)
        output_dir = self.output_root / name
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / upload["original_name"]
        log_file = self.log_dir / f"{name}.log"

        command = [
            sys.executable,
            "detect.py",
            "--weights",
            weights,
            "--source",
            upload["path"],
            "--output",
            str(output_dir.resolve()),
            "--img-size",
            str(img_size),
            "--conf-thres",
            str(conf_thres),
            "--iou-thres",
            str(iou_thres),
            "--device",
            device or "cpu",
        ]
        if save_txt:
            command.append("--save-txt")

        now = self._now()
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO inference_tasks(
                    name, source_name, source_path, source_type, weights, img_size, conf_thres,
                    iou_thres, device, save_txt, status, command, output_dir, output_path, log_file,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    upload["original_name"],
                    upload["path"],
                    upload["source_type"],
                    weights,
                    img_size,
                    conf_thres,
                    iou_thres,
                    device or "cpu",
                    1 if save_txt else 0,
                    subprocess.list2cmdline(command),
                    str(output_dir.resolve()),
                    str(output_path.resolve()),
                    str(log_file.resolve()),
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

        log_path = Path(task["log_file"])
        log_path.parent.mkdir(parents=True, exist_ok=True)
        started_at = self._now()
        with open(log_path, "a", encoding="utf-8") as handle:
            process = subprocess.Popen(
                task["command"],
                cwd=str(self.root_dir),
                stdout=handle,
                stderr=subprocess.STDOUT,
                shell=True,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
        self.processes[task_id] = process
        with self.connect() as conn:
            conn.execute(
                "UPDATE inference_tasks SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?",
                (started_at, started_at, task_id),
            )
        return self.get_task(task_id, refresh=False)

    def _poll_task(self, task):
        process = self.processes.get(task["id"])
        if not process:
            return task
        code = process.poll()
        if code is None:
            return task

        finished_at = self._now()
        status = "completed" if code == 0 else "failed"
        error_message = "" if code == 0 else f"inference process exited with code {code}"
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE inference_tasks
                SET status = ?, finished_at = ?, updated_at = ?, error_message = ?
                WHERE id = ?
                """,
                (status, finished_at, finished_at, error_message, task["id"]),
            )
        self.processes.pop(task["id"], None)
        return self.get_task(task["id"], refresh=False)

    def get_task(self, task_id: int, refresh: bool = True):
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM inference_tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return None
        task = self._row_to_dict(row)
        if refresh:
            task = self._poll_task(task)
        task["source_exists"] = Path(task["source_path"]).exists()
        task["output_exists"] = Path(task["output_path"]).exists()
        return task

    def list_tasks(self):
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM inference_tasks ORDER BY created_at DESC, id DESC"
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
        return {"task_id": task_id, "path": str(log_path), "lines": lines[-tail_lines:]}

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
                UPDATE inference_tasks
                SET status = 'stopped', finished_at = ?, updated_at = ?, error_message = ?
                WHERE id = ?
                """,
                (finished_at, finished_at, "stopped by user", task_id),
        )
        self.processes.pop(task_id, None)
        return self.get_task(task_id, refresh=False)

    def delete_task(self, task_id: int):
        task = self.get_task(task_id, refresh=False)
        if not task:
            return None

        if task["status"] == "running":
            self.stop_task(task_id)
            task = self.get_task(task_id, refresh=False)

        cleanup_paths = [
            Path(task["source_path"]),
            Path(task["output_path"]),
            Path(task["log_file"]),
        ]
        for cleanup_path in cleanup_paths:
            try:
                if cleanup_path.exists():
                    cleanup_path.unlink()
            except OSError:
                pass

        for folder in [Path(task["output_dir"]), self.task_dir / task["name"]]:
            try:
                if folder.exists():
                    shutil.rmtree(folder)
            except OSError:
                pass

        with self.connect() as conn:
            conn.execute("DELETE FROM inference_tasks WHERE id = ?", (task_id,))
        self.processes.pop(task_id, None)
        return {"id": task_id, "deleted": True, "name": task["name"]}
