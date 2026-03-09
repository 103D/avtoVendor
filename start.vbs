Option Explicit

' Эта версия запускает PowerShell-скрипт `start_with_browser.ps1`, который:
' 1) запускает Python (run.py) в отдельном процессе,
' 2) запускает браузер с отдельным профилем (msedge) и ждёт его закрытия,
' 3) после закрытия браузера завершает процесс Python.

Dim shell, fso, scriptDir, fullCmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
	' Запускаем PowerShell-скрипт в видимом окне (чтобы показывать консоль)
	fullCmd = "powershell -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & scriptDir & "\start_with_browser.ps1" & Chr(34) & " -AutoStopSeconds 6"
	' Используем WindowStyle=1 (видимое окно) — параметр третьим аргументом оставляем False (не ждать)
	shell.Run fullCmd, 1, False