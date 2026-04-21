import os
import platform
import sys
from flask import Flask, render_template, Response, jsonify, request

from annotation import AnnotationService, annotation_bp
from inference_ui import InferenceService, inference_bp
from training import TrainingService, training_bp

app = Flask(__name__)
app.config['ANNOTATION_SERVICE'] = AnnotationService(os.path.dirname(os.path.abspath(__file__)))
app.config['INFERENCE_SERVICE'] = InferenceService(os.path.dirname(os.path.abspath(__file__)))
app.config['TRAINING_SERVICE'] = TrainingService(os.path.dirname(os.path.abspath(__file__)))
app.config['YOLO_API_KEY'] = os.environ.get('YOLO_API_KEY', '').strip()
app.register_blueprint(annotation_bp)
app.register_blueprint(inference_bp)
app.register_blueprint(training_bp)


@app.before_request
def require_api_key():
    api_key = app.config.get('YOLO_API_KEY')
    if not api_key or not request.path.startswith('/api/'):
        return None
    if request.path in {'/api/health', '/api/info'}:
        return None
    if request.headers.get('X-API-Key') == api_key:
        return None
    return jsonify({'success': False, 'message': 'invalid api key'}), 401


@app.context_processor
def inject_runtime_config():
    return {'api_key': app.config.get('YOLO_API_KEY', '')}


@app.route('/')
def index():
    return render_template('home.html')


@app.route('/api/health')
def health_check():
    return {'status': 'ok'}


@app.route('/api/info')
def service_info():
    gpu_available = False
    torch_version = None
    cuda_version = None
    try:
        import torch
        torch_version = torch.__version__
        cuda_version = torch.version.cuda
        gpu_available = bool(torch.cuda.is_available())
    except Exception:
        pass

    return {
        'success': True,
        'data': {
            'name': 'YOLO Workbench Backend',
            'version': os.environ.get('YOLO_APP_VERSION', 'dev'),
            'python': sys.version.split()[0],
            'platform': platform.platform(),
            'torch': torch_version,
            'cuda': cuda_version,
            'gpu_available': gpu_available,
            'api_key_enabled': bool(app.config.get('YOLO_API_KEY')),
        },
    }


@app.route('/annotation')
def annotation_page():
    return render_template('annotation.html')


@app.route('/training')
def training_page():
    return render_template('training.html')


@app.route('/inference')
def inference_page():
    return render_template('inference.html')


def gen(camera):
    """Video streaming generator function."""
    while True:
        frame = camera.get_frame()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')


@app.route('/video_start')
def video_feed():
    """Video streaming route. Put this in the src attribute of an img tag."""
    from importlib import import_module

    if os.environ.get('CAMERA'):
        Camera = import_module('camera_' + os.environ['CAMERA']).Camera
    else:
        from camera import Camera
    return Response(gen(Camera()),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    app.run(host='0.0.0.0', threaded=True, port=5001)
