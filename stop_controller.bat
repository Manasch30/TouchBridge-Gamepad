@echo off
title Stop TouchBridge Gamepad
echo ========================================================
echo   Stopping TouchBridge Gamepad Receiver...
echo ========================================================
echo.

:: Find and terminate processes on port 8080 and 8765
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080') do (
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8765') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo Done! Server stopped and ports released.
timeout /t 2 >nul
