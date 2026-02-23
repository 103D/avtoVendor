from flask import Flask
from flask_session import Session
import os
from pathlib import Path

def create_app():
    # Получаем абсолютный путь к папке web_interface
    base_dir = Path(__file__).parent.parent
    template_folder = str(base_dir / 'templates')
    static_folder = str(base_dir / 'static')
    
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
    
    # Конфигурация
    app.config['SECRET_KEY'] = 'lassio-secret-key-2025'
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), '..', 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
    app.config['SESSION_TYPE'] = 'filesystem'
    
    Session(app)
    
    # CORS поддержка + запрет кеширования статических файлов
    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        # Запрещаем кеширование для JavaScript файлов
        if response.content_type and 'javascript' in response.content_type:
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response
    
    # Регистрация blueprints
    from app.routes import main_bp, api_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # Создание папки uploads если её нет
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    return app
