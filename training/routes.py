from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file


training_bp = Blueprint("training", __name__, url_prefix="/api/training")


def get_service():
    return current_app.config["TRAINING_SERVICE"]


def ok(data, status=200):
    return jsonify({"success": True, "data": data}), status


def fail(message, status=400):
    return jsonify({"success": False, "message": message}), status


@training_bp.route("/options", methods=["GET"])
def get_options():
    return ok(get_service().get_options())


@training_bp.route("/tasks", methods=["GET"])
def list_tasks():
    return ok(get_service().list_tasks())


@training_bp.route("/tasks", methods=["POST"])
def create_task():
    payload = request.get_json(silent=True) or {}
    try:
        task = get_service().create_task(payload)
    except KeyError as exc:
        return fail(f"missing required field: {exc.args[0]}")
    except ValueError as exc:
        return fail(str(exc))
    return ok(task, status=201)


@training_bp.route("/tasks/<int:task_id>", methods=["GET"])
def get_task(task_id):
    task = get_service().get_task(task_id)
    if not task:
        return fail("task not found", status=404)
    return ok(task)


@training_bp.route("/tasks/<int:task_id>/logs", methods=["GET"])
def get_task_logs(task_id):
    tail_lines = int(request.args.get("tail_lines", 200))
    payload = get_service().read_log(task_id, tail_lines=tail_lines)
    if not payload:
        return fail("task not found", status=404)
    return ok(payload)


@training_bp.route("/tasks/<int:task_id>/stop", methods=["POST"])
def stop_task(task_id):
    task = get_service().stop_task(task_id)
    if not task:
        return fail("task not found", status=404)
    return ok(task)


@training_bp.route("/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    payload = get_service().delete_task(task_id)
    if not payload:
        return fail("task not found", status=404)
    return ok(payload)


@training_bp.route("/tasks/<int:task_id>/artifacts/<artifact_name>", methods=["GET"])
def download_artifact(task_id, artifact_name):
    task = get_service().get_task(task_id)
    if not task:
        return fail("task not found", status=404)

    file_map = {
        "best": task.get("best_weight"),
        "last": task.get("last_weight"),
        **task.get("artifacts", {}),
    }
    target = file_map.get(artifact_name)
    if not target or not Path(target).exists():
        return fail("artifact not found", status=404)
    return send_file(target, as_attachment=True)
