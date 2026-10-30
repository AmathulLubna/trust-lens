@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24, then run this launcher again.
  pause
  exit /b 1
)
if not exist ".env.local" (
  echo Connect the existing Convex project first: npx convex dev --configure existing
  echo See CLOUD_SETUP.md for setup instructions.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo TrustLens: http://127.0.0.1:5173
echo Optional VoiceSentinel companion: run Start-VoiceSentinel.cmd on port 8765.
call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
if errorlevel 1 pause
