@echo off
rem Starts Deano (Glasshouse and the Potting Shed) on this computer and opens it in your browser.
rem It builds the latest code first, so what you see is always what is in the folder. Without that
rem step an update leaves the browser showing the old version while the folder holds the new one,
rem and the two stop matching: pages fill with errors that make no sense.
rem Leave this window open while you work; close it to stop it.
cd /d "%~dp0"
echo Getting Deano ready. This takes a few seconds.
call pnpm --filter @glasshouse/web build
if errorlevel 1 (
  echo.
  echo Deano could not be got ready, so it has not been started.
  echo Nothing is broken on your computer. Send the lines above to Claude and it will sort it out.
  echo.
  pause
  exit /b 1
)
start "" http://localhost:3000
call pnpm --filter @glasshouse/web start
