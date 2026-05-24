@echo off
cd /d "%~dp0"
echo.
echo   ===  Claude Counter  ===
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Opening the download page...
  start "" https://nodejs.org/en/download
  echo.
  pause
  exit /b
)

set "CCARCH=%PROCESSOR_ARCHITECTURE%"
if defined PROCESSOR_ARCHITEW6432 set "CCARCH=%PROCESSOR_ARCHITEW6432%"
set "npm_config_platform=win32"
if /I "%CCARCH%"=="ARM64" set "npm_config_arch=arm64"

if not exist "node_modules" call :firstrun

if not exist "node_modules\electron\dist\electron.exe" (
  echo   Fetching the Electron runtime...
  set "ELECTRON_SKIP_BINARY_DOWNLOAD="
  node "node_modules\electron\install.js"
  echo.
)

echo   Starting Claude Counter... you can minimize this window.
echo   Closing this window closes the app.
echo.
call npm start
echo.
echo   Claude Counter has closed. If it closed with an error,
echo   copy everything in this window and send it back.
pause
exit /b

:firstrun
echo   First-time setup. Clearing any stale runtime cache...
if exist "%LOCALAPPDATA%\electron\Cache" rmdir /s /q "%LOCALAPPDATA%\electron\Cache" 2>nul
echo   Installing - about 150 MB, a few minutes. Please wait...
echo.
call npm install
echo.
exit /b
