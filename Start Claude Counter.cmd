@echo off
title Claude Counter
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
echo.
echo   Claude Counter has closed. If it closed with an error,
echo   copy everything in this window and send it back.
pause
