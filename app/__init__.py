from flask import Flask
from flask_session import Session
import os
import shutil
import time
from pathlib import Path


def _cleanup_old_entries(target_dir: Path, max_age_seconds: int, remove_directories: bool = False) -> int:
    """Delete old files (and optionally directories) older than max_age_seconds."""
    if not target_dir.exists():
        return 0

    removed_count = 0
    now_ts = time.time()

    for entry in target_dir.iterdir():
        try:
            age_seconds = now_ts - entry.stat().st_mtime
            if age_seconds < max_age_seconds:
                continue

            if entry.is_file():
                entry.unlink(missing_ok=True)
                removed_count += 1
            elif remove_directories and entry.is_dir():
                shutil.rmtree(entry, ignore_errors=True)
                removed_count += 1
        except Exception:
            # Cleanup must never break app startup.
            continue

    return removed_count


def _run_startup_cleanup(writable_root: Path) -> None:
    """Cleanup stale local files to prevent disk growth over time."""
    cleanup_enabled = os.environ.get('AUTO_CLEANUP_ENABLED', '1') == '1'
    if not cleanup_enabled:
        return

    max_age_hours = int(os.environ.get('AUTO_CLEANUP_MAX_AGE_HOURS', '72'))
    max_age_seconds = max_age_hours * 3600

    uploads_dir = writable_root / 'uploads'
    sessions_dir = writable_root / 'sessions'

    removed_uploads = _cleanup_old_entries(uploads_dir, max_age_seconds, remove_directories=False)
    removed_sessions = _cleanup_old_entries(sessions_dir, max_age_seconds, remove_directories=True)

    if removed_uploads or removed_sessions:
        print(
            f"🧹 Автоочистка: uploads={removed_uploads}, sessions={removed_sessions}, "
            f"max_age_hours={max_age_hours}"
        )

def create_app():
    # Получаем абсолютный путь к папке web_interface
    base_dir = Path(__file__).parent.parent
    template_folder = str(base_dir / 'templates')
    static_folder = str(base_dir / 'static')
    
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)

    is_vercel = os.environ.get('VERCEL') == '1'
    writable_root = Path('/tmp') if is_vercel else base_dir
    
    # Конфигурация
    app.config['SECRET_KEY'] = 'lassio-secret-key-2025'
    app.config['UPLOAD_FOLDER'] = str(writable_root / 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['SESSION_FILE_DIR'] = str(writable_root / 'flask_session')
    
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
    os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)

    # Регулярная очистка устаревших локальных данных.
    _run_startup_cleanup(writable_root)
    
    return app
