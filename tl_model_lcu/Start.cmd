@echo off
setlocal
cd /d "%~dp0.."
if not exist ".local\voice-sentinel-venv\Scripts\python.exe" (
  echo The existing Python environment is missing. See tl_model_lcu\README.md.
  pause
  exit /b 1
)
".local\voice-sentinel-venv\Scripts\python.exe" "tl_model_lcu\launch.py" %*
if errorlevel 1 pause
