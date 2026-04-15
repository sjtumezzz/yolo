import os
import shutil
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

import yaml
from PIL import Image
from werkzeug.utils import secure_filename


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


class AnnotationService:
    def __init__(self, root_dir: str):
        self.root_dir = Path(root_dir)
        self.data_dir = self.root_dir / "annotation_data"
        self.dataset_dir = self.data_dir / "datasets"
        self.export_dir = self.data_dir / "exports"
        self.db_path = self.data_dir / "annotation.db"

        self.dataset_dir.mkdir(parents=True, exist_ok=True)
        self.export_dir.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self):
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS datasets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT DEFAULT '',
                    split_train REAL NOT NULL DEFAULT 0.8,
                    split_val REAL NOT NULL DEFAULT 0.2,
                    split_test REAL NOT NULL DEFAULT 0.0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS classes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dataset_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    color TEXT DEFAULT '#00FF00',
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(dataset_id, name),
                    UNIQUE(dataset_id, sort_order),
                    FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dataset_id INTEGER NOT NULL,
                    original_name TEXT NOT NULL,
                    stored_name TEXT NOT NULL,
                    relative_path TEXT NOT NULL,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'unannotated',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(dataset_id, stored_name),
                    FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS annotations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    image_id INTEGER NOT NULL,
                    class_id INTEGER NOT NULL,
                    x_min REAL NOT NULL,
                    y_min REAL NOT NULL,
                    x_max REAL NOT NULL,
                    y_max REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
                    FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
                );
                """
            )

    def _now(self):
        return datetime.utcnow().isoformat(timespec="seconds") + "Z"

    def _dataset_root(self, dataset_id: int) -> Path:
        return self.dataset_dir / str(dataset_id)

    def _dataset_images_dir(self, dataset_id: int) -> Path:
        path = self._dataset_root(dataset_id) / "images"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _row_to_dict(self, row):
        return dict(row) if row else None

    def _dataset_summary(self, conn, dataset_id: int):
        total_images = conn.execute(
            "SELECT COUNT(*) FROM images WHERE dataset_id = ?",
            (dataset_id,),
        ).fetchone()[0]
        annotated_images = conn.execute(
            "SELECT COUNT(*) FROM images WHERE dataset_id = ? AND status != 'unannotated'",
            (dataset_id,),
        ).fetchone()[0]
        class_count = conn.execute(
            "SELECT COUNT(*) FROM classes WHERE dataset_id = ?",
            (dataset_id,),
        ).fetchone()[0]
        return {
            "total_images": total_images,
            "annotated_images": annotated_images,
            "unannotated_images": max(total_images - annotated_images, 0),
            "class_count": class_count,
        }

    def create_dataset(self, name: str, description: str = "", split_train: float = 0.8, split_val: float = 0.2,
                       split_test: float = 0.0):
        split_sum = round(split_train + split_val + split_test, 6)
        if split_sum != 1.0:
            raise ValueError("split_train + split_val + split_test must equal 1.0")

        now = self._now()
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO datasets(name, description, split_train, split_val, split_test, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (name, description, split_train, split_val, split_test, now, now),
            )
            dataset_id = cursor.lastrowid
            self._dataset_images_dir(dataset_id)
            return self.get_dataset(dataset_id)

    def list_datasets(self):
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM datasets ORDER BY created_at DESC"
            ).fetchall()
            datasets = []
            for row in rows:
                item = self._row_to_dict(row)
                item.update(self._dataset_summary(conn, item["id"]))
                datasets.append(item)
            return datasets

    def get_dataset(self, dataset_id: int):
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM datasets WHERE id = ?",
                (dataset_id,),
            ).fetchone()
            if not row:
                return None
            dataset = self._row_to_dict(row)
            dataset["classes"] = self.list_classes(dataset_id, conn=conn)
            dataset.update(self._dataset_summary(conn, dataset_id))
            return dataset

    def list_classes(self, dataset_id: int, conn=None):
        owns_conn = conn is None
        if owns_conn:
            conn_cm = self.connect()
            conn = conn_cm.__enter__()
        try:
            rows = conn.execute(
                "SELECT * FROM classes WHERE dataset_id = ? ORDER BY sort_order ASC, id ASC",
                (dataset_id,),
            ).fetchall()
            return [self._row_to_dict(row) for row in rows]
        finally:
            if owns_conn:
                conn_cm.__exit__(None, None, None)

    def create_class(self, dataset_id: int, name: str, color: str = "#00FF00"):
        now = self._now()
        with self.connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM classes WHERE dataset_id = ?",
                (dataset_id,),
            ).fetchone()
            sort_order = row[0]
            cursor = conn.execute(
                """
                INSERT INTO classes(dataset_id, name, color, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (dataset_id, name, color, sort_order, now),
            )
            class_id = cursor.lastrowid
            created = conn.execute("SELECT * FROM classes WHERE id = ?", (class_id,)).fetchone()
            return self._row_to_dict(created)

    def update_class(self, dataset_id: int, class_id: int, name: str = None, color: str = None, sort_order: int = None):
        with self.connect() as conn:
            current = conn.execute(
                "SELECT * FROM classes WHERE id = ? AND dataset_id = ?",
                (class_id, dataset_id),
            ).fetchone()
            if not current:
                return None

            values = {
                "name": name if name is not None else current["name"],
                "color": color if color is not None else current["color"],
                "sort_order": sort_order if sort_order is not None else current["sort_order"],
            }
            conn.execute(
                """
                UPDATE classes
                SET name = ?, color = ?, sort_order = ?
                WHERE id = ? AND dataset_id = ?
                """,
                (values["name"], values["color"], values["sort_order"], class_id, dataset_id),
            )
            updated = conn.execute(
                "SELECT * FROM classes WHERE id = ?",
                (class_id,),
            ).fetchone()
            return self._row_to_dict(updated)

    def delete_class(self, dataset_id: int, class_id: int):
        with self.connect() as conn:
            result = conn.execute(
                "DELETE FROM classes WHERE id = ? AND dataset_id = ?",
                (class_id, dataset_id),
            )
            return result.rowcount > 0

    def add_images(self, dataset_id: int, files):
        saved_items = []
        image_dir = self._dataset_images_dir(dataset_id)
        now = self._now()

        with self.connect() as conn:
            dataset = conn.execute("SELECT id FROM datasets WHERE id = ?", (dataset_id,)).fetchone()
            if not dataset:
                raise ValueError("dataset not found")

            for file_storage in files:
                if not file_storage or not file_storage.filename:
                    continue

                suffix = Path(file_storage.filename).suffix.lower()
                if suffix not in ALLOWED_IMAGE_EXTENSIONS:
                    raise ValueError(f"unsupported image extension: {suffix}")

                original_name = secure_filename(file_storage.filename)
                stored_name = f"{uuid.uuid4().hex}{suffix}"
                target_path = image_dir / stored_name
                file_storage.save(target_path)

                with Image.open(target_path) as image:
                    width, height = image.size

                relative_path = str(Path(str(dataset_id)) / "images" / stored_name).replace("\\", "/")
                cursor = conn.execute(
                    """
                    INSERT INTO images(dataset_id, original_name, stored_name, relative_path, width, height, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'unannotated', ?, ?)
                    """,
                    (dataset_id, original_name, stored_name, relative_path, width, height, now, now),
                )
                image_id = cursor.lastrowid
                image_row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
                saved_items.append(self._serialize_image_row(conn, image_row))

        return saved_items

    def _serialize_image_row(self, conn, row):
        image = self._row_to_dict(row)
        annotation_count = conn.execute(
            "SELECT COUNT(*) FROM annotations WHERE image_id = ?",
            (image["id"],),
        ).fetchone()[0]
        image["annotation_count"] = annotation_count
        image["image_url"] = f"/api/annotation/images/{image['id']}/file"
        return image

    def list_images(self, dataset_id: int, status: str = None, page: int = 1, page_size: int = 20):
        offset = (max(page, 1) - 1) * max(page_size, 1)
        params = [dataset_id]
        where = ["dataset_id = ?"]
        if status in {"annotated", "unannotated", "reviewed"}:
            if status == "annotated":
                where.append("status != 'unannotated'")
            else:
                where.append("status = ?")
                params.append(status)

        query_where = " AND ".join(where)
        with self.connect() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM images WHERE {query_where}",
                tuple(params),
            ).fetchone()[0]
            rows = conn.execute(
                f"""
                SELECT * FROM images
                WHERE {query_where}
                ORDER BY created_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                tuple(params + [page_size, offset]),
            ).fetchall()
            return {
                "items": [self._serialize_image_row(conn, row) for row in rows],
                "page": page,
                "page_size": page_size,
                "total": total,
            }

    def get_image(self, image_id: int):
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM images WHERE id = ?",
                (image_id,),
            ).fetchone()
            if not row:
                return None
            image = self._serialize_image_row(conn, row)
            image["annotations"] = self.get_annotations(image_id, conn=conn)
            return image

    def get_image_path(self, image_id: int):
        with self.connect() as conn:
            row = conn.execute(
                "SELECT dataset_id, stored_name FROM images WHERE id = ?",
                (image_id,),
            ).fetchone()
            if not row:
                return None
            return self._dataset_images_dir(row["dataset_id"]) / row["stored_name"]

    def get_annotations(self, image_id: int, conn=None):
        owns_conn = conn is None
        if owns_conn:
            conn_cm = self.connect()
            conn = conn_cm.__enter__()
        try:
            image_row = conn.execute(
                "SELECT dataset_id, width, height FROM images WHERE id = ?",
                (image_id,),
            ).fetchone()
            if not image_row:
                return None
            class_map = {
                row["id"]: self._row_to_dict(row)
                for row in conn.execute(
                    "SELECT * FROM classes WHERE dataset_id = ?",
                    (image_row["dataset_id"],),
                ).fetchall()
            }
            rows = conn.execute(
                """
                SELECT id, image_id, class_id, x_min, y_min, x_max, y_max, created_at
                FROM annotations
                WHERE image_id = ?
                ORDER BY id ASC
                """,
                (image_id,),
            ).fetchall()
            items = []
            for row in rows:
                item = self._row_to_dict(row)
                item["class"] = class_map.get(item["class_id"])
                items.append(item)
            return {
                "image_id": image_id,
                "image_width": image_row["width"],
                "image_height": image_row["height"],
                "items": items,
            }
        finally:
            if owns_conn:
                conn_cm.__exit__(None, None, None)

    def replace_annotations(self, image_id: int, annotations):
        now = self._now()
        with self.connect() as conn:
            image_row = conn.execute(
                "SELECT id, dataset_id, width, height FROM images WHERE id = ?",
                (image_id,),
            ).fetchone()
            if not image_row:
                return None

            class_ids = {
                row["id"]
                for row in conn.execute(
                    "SELECT id FROM classes WHERE dataset_id = ?",
                    (image_row["dataset_id"],),
                ).fetchall()
            }

            normalized = []
            for annotation in annotations:
                class_id = annotation["class_id"]
                if class_id not in class_ids:
                    raise ValueError(f"class_id {class_id} does not belong to this dataset")

                x_min = max(0.0, min(float(annotation["x_min"]), image_row["width"]))
                y_min = max(0.0, min(float(annotation["y_min"]), image_row["height"]))
                x_max = max(0.0, min(float(annotation["x_max"]), image_row["width"]))
                y_max = max(0.0, min(float(annotation["y_max"]), image_row["height"]))
                if x_max <= x_min or y_max <= y_min:
                    raise ValueError("annotation box is invalid")

                normalized.append((image_id, class_id, x_min, y_min, x_max, y_max, now))

            conn.execute("DELETE FROM annotations WHERE image_id = ?", (image_id,))
            if normalized:
                conn.executemany(
                    """
                    INSERT INTO annotations(image_id, class_id, x_min, y_min, x_max, y_max, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    normalized,
                )

            status = "annotated" if normalized else "unannotated"
            conn.execute(
                "UPDATE images SET status = ?, updated_at = ? WHERE id = ?",
                (status, now, image_id),
            )
            return self.get_annotations(image_id)

    def export_yolo_dataset(self, dataset_id: int):
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            return None
        if not dataset["classes"]:
            raise ValueError("dataset has no classes")

        export_root = self.export_dir / f"dataset_{dataset_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        images_root = export_root / "images"
        labels_root = export_root / "labels"
        for split in ("train", "val", "test"):
            (images_root / split).mkdir(parents=True, exist_ok=True)
            (labels_root / split).mkdir(parents=True, exist_ok=True)

        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM images
                WHERE dataset_id = ? AND status != 'unannotated'
                ORDER BY id ASC
                """,
                (dataset_id,),
            ).fetchall()
            images = [self._row_to_dict(row) for row in rows]
            if not images:
                raise ValueError("dataset has no annotated images")

            total = len(images)
            train_count = int(total * dataset["split_train"])
            val_count = int(total * dataset["split_val"])
            if train_count == 0:
                train_count = 1
            if train_count + val_count > total:
                val_count = max(total - train_count, 0)
            split_names = []
            for index in range(total):
                if index < train_count:
                    split_names.append("train")
                elif index < train_count + val_count:
                    split_names.append("val")
                else:
                    split_names.append("test")
            if "val" not in split_names and total > 1:
                split_names[-1] = "val"

            classes = sorted(dataset["classes"], key=lambda item: item["sort_order"])
            class_to_index = {item["id"]: idx for idx, item in enumerate(classes)}

            exported_images = {"train": 0, "val": 0, "test": 0}
            for image, split in zip(images, split_names):
                source_path = self.get_image_path(image["id"])
                target_image_path = images_root / split / image["original_name"]
                shutil.copy2(source_path, target_image_path)

                annotation_rows = conn.execute(
                    """
                    SELECT class_id, x_min, y_min, x_max, y_max
                    FROM annotations
                    WHERE image_id = ?
                    ORDER BY id ASC
                    """,
                    (image["id"],),
                ).fetchall()
                yolo_lines = []
                for row in annotation_rows:
                    x_center = ((row["x_min"] + row["x_max"]) / 2.0) / image["width"]
                    y_center = ((row["y_min"] + row["y_max"]) / 2.0) / image["height"]
                    width = (row["x_max"] - row["x_min"]) / image["width"]
                    height = (row["y_max"] - row["y_min"]) / image["height"]
                    yolo_lines.append(
                        f"{class_to_index[row['class_id']]} "
                        f"{x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}"
                    )

                label_name = Path(image["original_name"]).stem + ".txt"
                (labels_root / split / label_name).write_text("\n".join(yolo_lines), encoding="utf-8")
                exported_images[split] += 1

        yaml_payload = {
            "train": str((images_root / "train").resolve()),
            "val": str((images_root / "val").resolve()),
            "test": str((images_root / "test").resolve()),
            "nc": len(classes),
            "names": [item["name"] for item in classes],
        }
        with open(export_root / "data.yaml", "w", encoding="utf-8") as file:
            yaml.safe_dump(yaml_payload, file, sort_keys=False, allow_unicode=True)

        return {
            "dataset_id": dataset_id,
            "export_dir": str(export_root),
            "data_yaml": str(export_root / "data.yaml"),
            "exported_images": exported_images,
        }
