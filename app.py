import os
from flask import Flask, render_template, Response

from annotation import AnnotationService, annotation_bp
from inference_ui import InferenceService, inference_bp
from training import TrainingService, training_bp

app = Flask(__name__)
app.config['ANNOTATION_SERVICE'] = AnnotationService(os.path.dirname(os.path.abspath(__file__)))
app.config['INFERENCE_SERVICE'] = InferenceService(os.path.dirname(os.path.abspath(__file__)))
app.config['TRAINING_SERVICE'] = TrainingService(os.path.dirname(os.path.abspath(__file__)))
app.register_blueprint(annotation_bp)
app.register_blueprint(inference_bp)
app.register_blueprint(training_bp)


@app.route('/')
def index():
    return render_template('home.html')


@app.route('/api/health')
def health_check():
    return {'status': 'ok'}


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
