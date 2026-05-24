@echo off
setlocal
set "APPDIR=%~dp0"
if "%APPDIR:~-1%"=="\" set "APPDIR=%APPDIR:~0,-1%"
set "EXE=%APPDIR%\node_modules\electron\dist\electron.exe"

if not exist "%EXE%" (
  echo.
  echo   Please run "Start Claude Counter" first so the app
  echo   finishes installing, then run this again.
  echo.
  pause
  exit /b
)

echo.
echo   Creating a "Claude Counter" shortcut...
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; foreach($p in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Startup'))){ $l=$w.CreateShortcut((Join-Path $p 'Claude Counter.lnk')); $l.TargetPath='%EXE%'; $l.Arguments='.'; $l.WorkingDirectory='%APPDIR%'; $l.Save() }"

echo.
echo   Done.
echo   - A "Claude Counter" shortcut is now on your Desktop.
echo     Right-click it and choose Pin to taskbar or Pin to Start.
echo   - It will also start automatically when you sign in to Windows.
echo.
pause
