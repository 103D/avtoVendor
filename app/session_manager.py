#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SessionManager - управление данными сессий
Хранит все данные локально в /sessions/{session_id}/
Структура папок:
  /sessions/{session_id}/
    ├── uploads/          - загруженные файлы
    ├── temp/             - временные файлы (CSV, JSON)
    ├── reports/          - финальные отчеты
    ├── config.json       - конфигурация (индексы, URL, дата получения)
    ├── state.json        - текущее состояние процесса
    └── logs.txt          - логирование всех операций
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional, Dict
import logging


class SessionManager:
    """Менеджер для управления данными сессий"""
    
    def __init__(self, session_id: str, base_path: Optional[str] = None):
        """
        Инициализация менеджера сессии
        
        Args:
            session_id: уникальный идентификатор сессии
            base_path: базовая папка для сессий (по умолчанию /tmp/sessions на Vercel)
        """
        self.session_id = session_id
        if base_path is None:
            base_path = "/tmp/sessions" if os.environ.get("VERCEL") == "1" else "sessions"
        self.base_path = Path(base_path)
        self.session_dir = self.base_path / session_id
        
        # Подпапки
        self.uploads_dir = self.session_dir / "uploads"
        self.temp_dir = self.session_dir / "temp"
        self.reports_dir = self.session_dir / "reports"
        
        # Файлы конфигурации
        self.config_file = self.session_dir / "config.json"
        self.state_file = self.session_dir / "state.json"
        self.logs_file = self.session_dir / "logs.txt"
        
        # Инициализируем структуру папок и логирование
        self._initialize_session()
    
    def _initialize_session(self) -> None:
        """Создаёт структуру папок и инициализирует логирование"""
        try:
            # Создаём все необходимые папки
            self.uploads_dir.mkdir(parents=True, exist_ok=True)
            self.temp_dir.mkdir(parents=True, exist_ok=True)
            self.reports_dir.mkdir(parents=True, exist_ok=True)
            
            # Инициализируем логирование
            self._setup_logging()
            
            # Логируем создание сессии
            self.log(f"✅ Сессия инициализирована: {self.session_id}")
            
        except Exception as e:
            raise RuntimeError(f"Ошибка при инициализации сессии: {str(e)}")
    
    def _setup_logging(self) -> None:
        """Настраивает логирование для консоли и файла"""
        # Удаляем старые логи при новой сессии (перезаписываем файл)
        try:
            if self.logs_file.exists():
                self.logs_file.unlink()
        except Exception:
            pass  # Если файл занят, просто продолжаем
        
        # Создаём уникальный логгер для этой сессии
        logger_name = f"session_{self.session_id}"
        self.logger = logging.getLogger(logger_name)
        self.logger.setLevel(logging.INFO)
        
        # Удаляем старые обработчики если они есть
        self.logger.handlers.clear()
        
        # Добавляем обработчик файла
        try:
            file_handler = logging.FileHandler(self.logs_file, encoding='utf-8')
            file_handler.setLevel(logging.INFO)
            formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
            file_handler.setFormatter(formatter)
            self.logger.addHandler(file_handler)
        except Exception:
            pass  # Если не удаётся открыть файл, логируем только в консоль
        
        # Добавляем обработчик консоли
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)
    
    def log(self, message: str, level: str = "INFO") -> None:
        """
        Логирует сообщение в файл и консоль
        
        Args:
            message: текст сообщения
            level: уровень логирования (INFO, WARNING, ERROR, DEBUG)
        """
        log_level = getattr(logging, level.upper(), logging.INFO)
        self.logger.log(log_level, message)
    
    def save_config(self, config: Dict[str, Any]) -> None:
        """
        Сохраняет конфигурацию в config.json
        Добавляет в начало файла дату и время получения
        При повторном вызове перезаписывает файл
        
        Args:
            config: словарь с параметрами конфигурации
        """
        try:
            # Добавляем метаданные
            config_with_meta: Dict[str, Any] = {
                "saved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "session_id": self.session_id,
                **config
            }
            
            # Перезаписываем файл
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config_with_meta, f, ensure_ascii=False, indent=2)
            
            self.log(f"✅ Конфиг сохранён: {self.config_file}")
            
        except Exception as e:
            self.log(f"❌ Ошибка при сохранении конфига: {str(e)}", "ERROR")
            raise
    
    def load_config(self) -> Optional[Dict[str, Any]]:
        """
        Загружает конфигурацию из config.json
        
        Returns:
            словарь с конфигурацией или None если файл не существует
        """
        try:
            if not self.config_file.exists():
                self.log("⚠️ config.json не найден", "WARNING")
                return None
            
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            self.log(f"✅ Конфиг загружен: {config.get('saved_at', 'дата неизвестна')}")
            return config
            
        except Exception as e:
            self.log(f"❌ Ошибка при загрузке конфига: {str(e)}", "ERROR")
            return None
    
    def save_state(self, state: Dict[str, Any]) -> None:
        """
        Сохраняет состояние процесса в state.json
        Показывает на каком этапе находится пользователь
        
        Args:
            state: словарь с информацией о состоянии
        """
        try:
            state_with_meta: Dict[str, Any] = {
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                **state
            }
            
            with open(self.state_file, 'w', encoding='utf-8') as f:
                json.dump(state_with_meta, f, ensure_ascii=False, indent=2)
            
            self.log(f"✅ Состояние сохранено: этап {state.get('current_stage', '?')}")
            
        except Exception as e:
            self.log(f"❌ Ошибка при сохранении состояния: {str(e)}", "ERROR")
            raise
    
    def load_state(self) -> Optional[Dict[str, Any]]:
        """
        Загружает состояние процесса из state.json
        
        Returns:
            словарь с состоянием или None если файл не существует
        """
        try:
            if not self.state_file.exists():
                self.log("⚠️ state.json не найден", "WARNING")
                return None
            
            with open(self.state_file, 'r', encoding='utf-8') as f:
                state = json.load(f)
            
            self.log(f"✅ Состояние загружено: {state.get('updated_at', 'дата неизвестна')}")
            return state
            
        except Exception as e:
            self.log(f"❌ Ошибка при загрузке состояния: {str(e)}", "ERROR")
            return None
    
    def save_json(self, filename: str, data: Dict[str, Any], subfolder: str = "temp") -> Path:
        """
        Сохраняет JSON файл в подпапку
        
        Args:
            filename: имя файла
            data: данные для сохранения
            subfolder: подпапка ("uploads", "temp" или "reports")
        
        Returns:
            путь к сохранённому файлу
        """
        try:
            # Выбираем папку
            if subfolder == "uploads":
                target_dir = self.uploads_dir
            elif subfolder == "reports":
                target_dir = self.reports_dir
            else:
                target_dir = self.temp_dir
            
            filepath = target_dir / filename
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            self.log(f"✅ JSON сохранён: {filename}")
            return filepath
            
        except Exception as e:
            self.log(f"❌ Ошибка при сохранении JSON: {str(e)}", "ERROR")
            raise
    
    def load_json(self, filename: str, subfolder: str = "temp") -> Optional[Dict[str, Any]]:
        """
        Загружает JSON файл из подпапки
        
        Args:
            filename: имя файла
            subfolder: подпапка ("uploads", "temp" или "reports")
        
        Returns:
            словарь с данными или None если файл не существует
        """
        try:
            # Выбираем папку
            if subfolder == "uploads":
                target_dir = self.uploads_dir
            elif subfolder == "reports":
                target_dir = self.reports_dir
            else:
                target_dir = self.temp_dir
            
            filepath = target_dir / filename
            
            if not filepath.exists():
                self.log(f"⚠️ Файл не найден: {filename}", "WARNING")
                return None
            
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            self.log(f"✅ JSON загружен: {filename}")
            return data
            
        except Exception as e:
            self.log(f"❌ Ошибка при загрузке JSON: {str(e)}", "ERROR")
            return None
    
    def save_text(self, filename: str, content: str, subfolder: str = "temp") -> Path:
        """
        Сохраняет текстовый файл
        
        Args:
            filename: имя файла
            content: содержимое файла
            subfolder: подпапка ("uploads", "temp" или "reports")
        
        Returns:
            путь к сохранённому файлу
        """
        try:
            if subfolder == "uploads":
                target_dir = self.uploads_dir
            elif subfolder == "reports":
                target_dir = self.reports_dir
            else:
                target_dir = self.temp_dir
            
            filepath = target_dir / filename
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            
            self.log(f"✅ Текстовый файл сохранён: {filename}")
            return filepath
            
        except Exception as e:
            self.log(f"❌ Ошибка при сохранении текстового файла: {str(e)}", "ERROR")
            raise
    
    def load_text(self, filename: str, subfolder: str = "temp") -> Optional[str]:
        """
        Загружает текстовый файл
        
        Args:
            filename: имя файла
            subfolder: подпапка ("uploads", "temp" или "reports")
        
        Returns:
            содержимое файла или None если файл не существует
        """
        try:
            if subfolder == "uploads":
                target_dir = self.uploads_dir
            elif subfolder == "reports":
                target_dir = self.reports_dir
            else:
                target_dir = self.temp_dir
            
            filepath = target_dir / filename
            
            if not filepath.exists():
                self.log(f"⚠️ Файл не найден: {filename}", "WARNING")
                return None
            
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            self.log(f"✅ Текстовый файл загружен: {filename}")
            return content
            
        except Exception as e:
            self.log(f"❌ Ошибка при загрузке текстового файла: {str(e)}", "ERROR")
            return None
    
    def delete_session(self) -> bool:
        """
        Удаляет всю папку сессии и все её содержимое
        
        Returns:
            True если успешно удалено, False иначе
        """
        try:
            import shutil
            shutil.rmtree(self.session_dir)
            self.log(f"✅ Сессия удалена: {self.session_id}", "WARNING")
            return True
            
        except Exception as e:
            self.log(f"❌ Ошибка при удалении сессии: {str(e)}", "ERROR")
            return False
    
    def get_session_info(self) -> Dict[str, Any]:
        """
        Получает информацию о сессии
        
        Returns:
            словарь с информацией о сессии
        """
        return {
            "session_id": self.session_id,
            "session_dir": str(self.session_dir),
            "config_file": str(self.config_file),
            "state_file": str(self.state_file),
            "logs_file": str(self.logs_file),
            "created_at": datetime.fromtimestamp(self.session_dir.stat().st_birthtime).strftime("%Y-%m-%d %H:%M:%S") if self.session_dir.exists() else None
        }


# Для удобства - глобальная переменная текущей сессии
current_session: Optional[SessionManager] = None


def init_session(session_id: str) -> SessionManager:
    """Инициализирует новую сессию и устанавливает её как текущую"""
    global current_session
    current_session = SessionManager(session_id)
    return current_session


def get_session() -> Optional[SessionManager]:
    """Получает текущую сессию"""
    return current_session
