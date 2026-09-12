@echo off
rem Starts the Room on this computer and opens it in your browser.
rem Leave this window open while you work; close it to stop the Room.
cd /d "%~dp0"

rem Build first, every time. Without this the Room starts from whatever was built last, so after
rem an update the browser is shown the old version of the product while the folder holds the new
rem one: pages and the parts of the Room they talk to stop matching, and the screen fills with
rem errors that make no sense. Building takes a few seconds and keeps the two in step.
echo Getting the Room ready. This takes a few seconds the first time.
call pnpm --filter @glasshouse/web build
if errorlevel 1 (
  echo.
  echo The Room could not be got ready, so it has not been started.
  echo Nothing is broken on your computer. Send the lines above to Claude and it will sort it out.
  echo.
  pause
  exit /b 1
)

start "" http://localhost:3000
call pnpm --filter @glasshouse/web start
