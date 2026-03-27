@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-loc-data.ps1" %*
if errorlevel 1 (
  echo.
  echo Sync failed.
  exit /b 1
)
echo.
echo Sync completed.
