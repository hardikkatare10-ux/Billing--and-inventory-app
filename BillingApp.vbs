Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\ADMIN\OneDrive\Desktop\The billing software\Billing and Inventory App"
WshShell.Run "cmd /c npm run dev", 0, False
WScript.Sleep 3000
WshShell.Run """C:\Program Files\Google\Chrome\Application\chrome.exe"" --app=http://localhost:5173", 0, False
