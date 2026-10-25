@echo off
title TouchBridge Gamepad Receiver
cd /d "%~dp0"
echo ========================================================
echo   Starting TouchBridge Gamepad Receiver...
echo ========================================================
echo.
python server.py
pause
