@echo off
REM Скрипт для сборки Flask приложения в standalone exe с PyInstaller
REM ================================================================

echo.
echo ========================================
echo   Сборка Web приложения в EXE
echo ========================================
echo.

REM Проверка Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python не установлен или не в PATH!
    pause
    exit /b 1
)

echo [INFO] Установка зависимостей...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Ошибка при установке зависимостей!
    pause
    exit /b 1
)

echo [INFO] Очистка старой сборки...
rmdir /s /q build 2>nul
rmdir /s /q dist 2>nul
del /q *.spec 2>nul

echo [INFO] Сборка приложения с PyInstaller...
pyinstaller --distpath ./dist --buildpath ./build --specpath . build_app.spec

if errorlevel 1 (
    echo [ERROR] Ошибка при сборке!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   ✓ Сборка успешно завершена!
echo ========================================
echo.
echo Exe файл находится в: dist\WebApp.exe
echo.
pause
