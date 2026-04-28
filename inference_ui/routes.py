from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file


inference_bp = Blueprint("inference", __name__, url_prefix="/api/inference")


def get_service():
    return current_app.config["INFERENCE_SERVICE"]


def ok(data, status=200):
    return jsonify({"success": True, "data": data}), status


def fail(message, status=400):
    return jsonify({"success": False, "message": message}), status


@inference_bp.route("/options", methods=["GET"])
def get_options():
    return ok(get_service().get_options())


@inference_bp.route("/tasks", methods=["GET"])
def list_tasks():
    return ok(get_service().list_tasks())


@inference_bp.route("/tasks", methods=["POST"])
def create_task():
    payload = request.form.to_dict()
    file_storage = request.files.get("file")
    try:
        task = get_service().create_task(file_storage, payload)
    except KeyError as exc:
        return fail(f"missing required field: {exc.args[0]}")
    except ValueError as exc:
        return fail(str(exc))
    return ok(task, status=201)


@inference_bp.route("/tasks/<int:task_id>", methods=["GET"])
def get_task(task_id):
    task = get_service().get_task(task_id)
    if not task:
        return fail("task not found", status=404)
    return ok(task)


@inference_bp.route("/tasks/<int:task_id>/logs", methods=["GET"])
def get_logs(task_id):
    payload = get_service().read_log(task_id, tail_lines=int(request.args.get("tail_lines", 200)))
    if not payload:
        return fail("task not found", status=404)
    return ok(payload)


@inference_bp.route("/tasks/<int:task_id>/stop", methods=["POST"])
def stop_task(task_id):
    task = get_service().stop_task(task_id)
    if not task:
        return fail("task not found", status=404)
    return ok(task)


@inference_bp.route("/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    payload = get_service().delete_task(task_id)
    if not payload:
        return fail("task not found", status=404)
    return ok(payload)


@inference_bp.route("/tasks/<int:task_id>/source", methods=["GET"])
def download_source(task_id):
    task = get_service().get_task(task_id)
    if not task or not Path(task["source_path"]).exists():
      return fail("source file not found", status=404)
    return send_file(task["source_path"], as_attachment=True)


@inference_bp.route("/tasks/<int:task_id>/output", methods=["GET"])
def download_output(task_id):
    task = get_service().get_task(task_id)
    if not task or not Path(task["output_path"]).exists():
      return fail("output file not found", status=404)
    return send_file(task["output_path"], as_attachment=True)


@inference_bp.route("/tasks/<int:task_id>/output/preview", methods=["GET"])
def preview_output(task_id):
    task = get_service().get_task(task_id)
    if not task or not Path(task["output_path"]).exists():
      return fail("output file not found", status=404)
    return send_file(task["output_path"], as_attachment=False)
