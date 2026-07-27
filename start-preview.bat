@echo off
rem Double-click to preview the app. Starts Vite on http://localhost:7100/
rem and keeps this window open so any error stays visible.
cd /d "%~dp0"
title Travel Companion - dev server
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: npm was not found on PATH. Node.js is not reachable from cmd.
  echo Try installing Node.js LTS from https://nodejs.org and re-run this file.
  echo.
  pause
  exit /b 1
)
echo Starting Travel Companion on http://localhost:7100/ ...
echo (Leave this window open while you use the app; Ctrl+C stops the server.)
start "" "http://localhost:7100/"
npm run dev -- --port 7100
echo.
echo The dev server exited with code %errorlevel%.
echo If that happened immediately, copy the error above and share it.
pause
