@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $app='%~dp0'.TrimEnd('\'); foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Startup'))){ $s=$ws.CreateShortcut($d+'\Claude Counter.lnk'); $s.TargetPath=$app+'\runtime\electron.exe'; $s.Arguments=[char]34+$app+[char]34; $s.WorkingDirectory=$app; $s.Save() }"
echo.
echo   A "Claude Counter" shortcut is now on your Desktop.
echo   Right-click it and choose Pin to taskbar.
echo   It will also start automatically when you sign in to Windows.
pause
