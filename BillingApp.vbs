Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = WScript.ScriptFullName
scriptDir = fso.GetParentFolderName(scriptPath)
WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c npm run dev", 0, False
WScript.Sleep 3000
WshShell.Run """C:\Program Files\Google\Chrome\Application\chrome.exe"" --app=http://localhost:5173", 0, False
