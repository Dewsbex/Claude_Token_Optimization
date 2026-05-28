@echo off
setlocal
set "APPDIR=%~dp0"
if "%APPDIR:~-1%"=="\" set "APPDIR=%APPDIR:~0,-1%"

rem Pick whichever Electron the user has on this machine. v0.5 ships run.ps1
rem (which fetches runtime\electron.exe); older installs used npm install
rem (which leaves node_modules\electron\dist\electron.exe).
set "EXE=%APPDIR%\runtime\electron.exe"
if not exist "%EXE%" set "EXE=%APPDIR%\node_modules\electron\dist\electron.exe"

if not exist "%EXE%" (
  echo.
  echo   Please run "Start Claude Counter" first so the Electron runtime
  echo   downloads, then run this again.
  echo.
  pause
  exit /b
)

echo.
echo   Creating a "Claude Counter" shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Startup'))){ $s=$ws.CreateShortcut((Join-Path $d 'Claude Counter.lnk')); $s.TargetPath='%EXE%'; $s.Arguments=[char]34+'%APPDIR%'+[char]34; $s.WorkingDirectory='%APPDIR%'; $s.IconLocation='%APPDIR%\icon.ico,0'; $s.Description='Claude Counter - usage HUD for Claude'; $s.Save() }"
echo.
echo   Done.
echo   - A "Claude Counter" shortcut is now on your Desktop with the app icon.
echo     Right-click it and choose Pin to taskbar.
echo   - It will also start automatically when you sign in to Windows.
echo.
pause
