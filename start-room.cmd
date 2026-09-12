@echo off
rem Starts Deano (Glasshouse and the Potting Shed) on this computer and opens it in your browser.
rem It builds the latest code first, so what you see is always what is in the folder.
rem Leave this window open while you work; close it to stop it.
cd /d "%~dp0"
call pnpm --filter @glasshouse/web build
if errorlevel 1 (
  echo The build failed. Fix the error above, then run this again.
  pause
  exit /b 1
)
start "" http://localhost:3000
call pnpm --filter @glasshouse/web start
