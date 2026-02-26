# Param handling: allow passing $ScriptDir, otherwise resolve it robustly
Param(
    [string]$ScriptDir,
    [int]$AutoStopSeconds = 0
)

# Resolve script directory robustly in this order:
# 1) explicit parameter, 2) PSScriptRoot (when script run from file),
# 3) MyInvocation path, 4) current location.
if (-not $ScriptDir) {
    if ($PSScriptRoot) {
        $ScriptDir = $PSScriptRoot
    } elseif ($MyInvocation -and $MyInvocation.MyCommand.Path) {
        $ScriptDir = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
    } else {
        $ScriptDir = (Get-Location).ProviderPath
    }
}

# Ensure we have an absolute path
try {
    $ScriptDir = [System.IO.Path]::GetFullPath($ScriptDir)
} catch {
    Write-Error "Неверный путь для ScriptDir: '$ScriptDir' - $_"
    exit 1
}

$runPy = Join-Path $ScriptDir "run.py"
$logFile = Join-Path $ScriptDir "run_log.txt"
$runPy = Join-Path $ScriptDir "run.py"
$logFile = Join-Path $ScriptDir "run_log.txt"

# Determine Python executable to use. Prefer explicit env `PYTHON_EXE`, then common install paths,
# then try to resolve a 3.12 interpreter via the py launcher. Fall back to 'py -3' if unresolved.
$pythonExe = $env:PYTHON_EXE
if (-not $pythonExe) {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "C:\\Python312\\python.exe",
        "C:\\Python313\\python.exe"
    )
    foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { $pythonExe = $p; break } }
}
if (-not $pythonExe) {
    try {
        $out = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($out) { $pythonExe = $out.Trim() }
    } catch {}
}

if ($pythonExe) {
    Write-Host "Запускаю Python в новом окне: $pythonExe"
    # Открываем отдельное PowerShell-окно, которое запустит интерпретатор Python с нашим скриптом.
    $cmd = "& `"$pythonExe`" `"$runPy`""
    $pyProc = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command",$cmd -PassThru
} else {
    Write-Host "Запускаю через py-лаунчер (fallback) в новом окне"
    $cmd = "py -3 `"$runPy`""
    $pyProc = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command",$cmd -PassThru
}

# Give server a moment to start
Start-Sleep -Seconds 2

# Prefer launching msedge with an isolated profile so we can reliably wait for its window to close
$browserExe = "msedge"
$profileDir = Join-Path $ScriptDir ".browser_profile"
if (Get-Command $browserExe -ErrorAction SilentlyContinue) {
    # Ensure profile dir exists
    if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir | Out-Null }
    $browserArgs = "--new-window","--user-data-dir=`"$profileDir`"","http://127.0.0.1:5000"
    Write-Host "Запускаю msedge и жду закрытия окна..."
    $b = Start-Process -FilePath $browserExe -ArgumentList $browserArgs -PassThru
    Wait-Process -Id $b.Id
} else {
        # Fallback: open default URL (may reuse existing browser process) — cannot reliably wait for tab close
        Start-Process "http://127.0.0.1:5000"
        Write-Host "Открыт URL в системном браузере. Если это вкладка в уже открытом браузере, скрипт не сможет отследить её закрытие."
        # Если задана переменная окружения AUTO_STOP_SECONDS, ждём это количество секунд и продолжаем
        # Выбираем источник времени ожидания: параметр функции имеет приоритет, затем переменная окружения
        if (-not $AutoStopSeconds -or $AutoStopSeconds -eq 0) {
            $envVal = $env:AUTO_STOP_SECONDS
            if ($envVal -and ($envVal -as [int] -gt 0)) { $AutoStopSeconds = [int]$envVal }
        }

        if ($AutoStopSeconds -and ($AutoStopSeconds -gt 0)) {
            Write-Host "AUTO_STOP_SECONDS задано=$AutoStopSeconds, буду ждать и затем остановлю сервер автоматически."
            Start-Sleep -Seconds $AutoStopSeconds
        } else {
            Write-Host "Ожидание ввода пользователя для остановки сервера (нажмите Enter)..."
            Read-Host | Out-Null
        }
}

# After browser closed (or user confirmed), stop python
try {
    if ($pyProc -and ($pyProc.Id -ne $null)) {
        Write-Host "Останавливаю процесс запускающего окна (PID=$($pyProc.Id))..."
        # Пробуем корректно завершить процесс, который мы запустили (это будет PowerShell-окно,
        # которое запустило Python). Если не удаётся, применяем форсированное завершение.
        try {
            Stop-Process -Id $pyProc.Id -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Warning "Не удалось завершить процесс PID=$($pyProc.Id): $_"
        }
        # Раньше здесь мы пытались убивать любые процессы, слушающие порт 5000.
        # Это было небезопасно: при обновлении/перезагрузке страницы могут появляться временные сокеты
        # и скрипт случайно завершал процессы приложения. Теперь оставим только корректное
        # завершение процесса Python, который мы запустили ($pyProc).
        # Если потребуется — можно вернуть принудительное завершение слушателей порта,
        # но это должно быть явной опцией, а не поведением по умолчанию.
    }
} catch {
    Write-Warning "Не удалось завершить Python-процесс: $_"
}

# Exit
Exit 0
