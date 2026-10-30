@echo off
setlocal
cd /d "%~dp0"
if not exist ".local\voice-sentinel-venv\Scripts\python.exe" (
  echo The VoiceSentinel Python environment is missing.
  echo See ml\voice_sentinel\LOCAL_WEB_DEMO.md for setup.
  pause
  exit /b 1
)
echo VoiceSentinel companion: http://127.0.0.1:8765/pair
echo TrustLens web app uses port 5173 separately.
".local\voice-sentinel-venv\Scripts\python.exe" "ml\voice_sentinel\launch_local.py"
if errorlevel 1 pause
