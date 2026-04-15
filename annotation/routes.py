from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file


annotation_bp = Blueprint("annotation", __name__, url_prefix="/api/annotation")


def get_service():
    return current_app.config["ANNOTATION_SERVICE"]


def ok(data, status=200):
    return jsonify({"success": True, "data": data}), status


def fail(message, status=400):
    return jsonify({"success": False, "message": message}), status


@annotation_bp.route("/datasets", methods=["GET"])
def list_datasets():
    return ok(get_service().list_datasets())


@annotation_bp.route("/datasets", methods=["POST"])
def create_dataset():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return fail("name is required")
    try:
        dataset = get_service().create_dataset(
            name=name,
            description=(payload.get("description") or "").strip(),
            split_train=float(payload.get("split_train", 0.8)),
            split_val=float(payload.get("split_val", 0.2)),
            split_test=float(payload.get("split_test", 0.0)),
        )
    except ValueError as exc:
        return fail(str(exc))
    except Exception as exc:
        return fail(str(exc), status=409)
    return ok(dataset, status=201)


@annotation_bp.route("/datasets/<int:dataset_id>", methods=["GET"])
def get_dataset(dataset_id):
    dataset = get_service().get_dataset(dataset_id)
    if not dataset:
        return fail("dataset not found", status=404)
    return ok(dataset)


@annotation_bp.route("/datasets/<int:dataset_id>/classes", methods=["GET"])
def list_classes(dataset_id):
    dataset = get_service().get_dataset(dataset_id)
    if not dataset:
        return fail("dataset not found", status=404)
    return ok(dataset["classes"])


@annotation_bp.route("/datasets/<int:dataset_id>/classes", methods=["POST"])
def create_class(dataset_id):
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return fail("name is required")
    try:
        item = get_service().create_class(
            dataset_id=dataset_id,
            name=name,
            color=payload.get("color", "#00FF00"),
        )
    except ValueError as exc:
        return fail(str(exc))
    except Exception as exc:
        return fail(str(exc), status=409)
    return ok(item, status=201)


@annotation_bp.route("/datasets/<int:dataset_id>/classes/<int:class_id>", methods=["PUT"])
def update_class(dataset_id, class_id):
    payload = request.get_json(silent=True) or {}
    try:
        item = get_service().update_class(
            dataset_id=dataset_id,
            class_id=class_id,
            name=payload.get("name"),
            color=payload.get("color"),
            sort_order=payload.get("sort_order"),
        )
    except Exception as exc:
        return fail(str(exc), status=409)
    if not item:
        return fail("class not found", status=404)
    return ok(item)


@annotation_bp.route("/datasets/<int:dataset_id>/classes/<int:class_id>", methods=["DELETE"])
def delete_class(dataset_id, class_id):
    deleted = get_service().delete_class(dataset_id, class_id)
    if not deleted:
        return fail("class not found", status=404)
    return ok({"deleted": True})


@annotation_bp.route("/datasets/<int:dataset_id>/images", methods=["POST"])
def upload_images(dataset_id):
    files = request.files.getlist("files")
    if not files:
        return fail("files are required")
    try:
        items = get_service().add_images(dataset_id, files)
    except ValueError as exc:
        return fail(str(exc))
    return ok(items, status=201)


@annotation_bp.route("/datasets/<int:dataset_id>/images", methods=["GET"])
def list_images(dataset_id):
    data = get_service().list_images(
        dataset_id=dataset_id,
        status=request.args.get("status"),
        page=int(request.args.get("page", 1)),
        page_size=int(request.args.get("page_size", 20)),
    )
    return ok(data)


@annotation_bp.route("/images/<int:image_id>", methods=["GET"])
def get_image(image_id):
    item = get_service().get_image(image_id)
    if not item:
        return fail("image not found", status=404)
    return ok(item)


@annotation_bp.route("/images/<int:image_id>/file", methods=["GET"])
def get_image_file(image_id):
    path = get_service().get_image_path(image_id)
    if not path or not Path(path).exists():
        return fail("image file not found", status=404)
    return send_file(path)


@annotation_bp.route("/images/<int:image_id>/annotations", methods=["GET"])
def get_annotations(image_id):
    data = get_service().get_annotations(image_id)
    if not data:
        return fail("image not found", status=404)
    return ok(data)


@annotation_bp.route("/images/<int:image_id>/annotations", methods=["PUT"])
def replace_annotations(image_id):
    payload = request.get_json(silent=True) or {}
    annotations = payload.get("annotations")
    if annotations is None or not isinstance(annotations, list):
        return fail("annotations must be a list")
    try:
        data = get_service().replace_annotations(image_id, annotations)
    except ValueError as exc:
        return fail(str(exc))
    if not data:
        return fail("image not found", status=404)
    return ok(data)


@annotation_bp.route("/datasets/<int:dataset_id>/export", methods=["POST"])
def export_dataset(dataset_id):
    try:
        data = get_service().export_yolo_dataset(dataset_id)
    except ValueError as exc:
        return fail(str(exc))
    if not data:
        return fail("dataset not found", status=404)
    return ok(data)
