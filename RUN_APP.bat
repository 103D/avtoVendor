@echo off
REM Запуск приложения - для конечных пользователей
REM Автоматически открывает приложение в браузере

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   Web приложение
echo ========================================
echo.
echo Запуск приложения...
echo.

REM Получить путь к exe файлу
set "APP_PATH=%~dp0WebApp.exe"

REM Проверка наличия exe файла
if not exist "!APP_PATH!" (
    echo [ERROR] Не найден файл WebApp.exe!
    echo Убедитесь, что файл находится в той же папке что и этот батник.
    pause
    exit /b 1
)

REM Запустить приложение в фоне
start "" "!APP_PATH!"

REM Небольшая задержка для запуска сервера
timeout /t 3 /nobreak

REM Открыть браузер
echo Открытие браузера...
start http://localhost:5000

REM Вывести сообщение
echo.
echo ========================================
echo ✓ Приложение запущено!
echo ========================================
echo.
echo Адрес: http://localhost:5000
echo.
echo Закройте это окно когда закончите работу.
echo.

REM Ждать закрытия
pause

REM Завершить процесс приложения
taskkill /IM WebApp.exe /F 2>nul
