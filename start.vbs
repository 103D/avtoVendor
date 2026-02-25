Option Explicit

Dim shell, fso, scriptDir, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir

' Запускаем сервер через py (попытка использовать py-лаунчер). Логируем stdout/stderr в run_log.txt
Dim pyCmd, fullCmd, logFile
logFile = scriptDir & "\run_log.txt"
pyCmd = "py -3 """ & scriptDir & "\run.py""" & " >> """ & logFile & """ 2>&1"
' Ensure Python uses UTF-8 for IO so emojis and non-ASCII can be written to the log
shell.Environment("PROCESS")("PYTHONIOENCODING") = "utf-8"
fullCmd = "cmd /c " & pyCmd
shell.Run fullCmd, 0, False

' Подождём немного, затем откроем браузер (чтобы UI открылся после старта сервера)
shell.Run "powershell -NoProfile -WindowStyle Hidden -Command ""Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:5000'""", 0, False
