Option Explicit

Dim shell, fso, scriptDir, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir

shell.Run "powershell -NoProfile -WindowStyle Hidden -Command ""Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:5000'""", 0, False

cmd = "pythonw """ & scriptDir & "\run.py"""
shell.Run cmd, 0, False
