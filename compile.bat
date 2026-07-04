@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js, then run compile.bat again.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required. Install Node.js with npm, then run compile.bat again.
  exit /b 1
)

call npm install
if errorlevel 1 exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-icons.ps1"
if errorlevel 1 exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\download-rclone.ps1"
if errorlevel 1 exit /b 1

call npm run build:win-portable
if errorlevel 1 exit /b 1

echo.
echo Portable build is in the release folder.
