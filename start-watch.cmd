@echo off
rem Starts the connector's watcher for every folder you have connected, and keeps it running.
rem While this window is open, two things happen:
rem   - plain file saves, commits and Codex's own logs are followed, so the Room sees them;
rem   - what you ask for in Glasshouse's chat is picked up here and started on this computer,
rem     in the project's folder, and the questions an agent asks come back to the Room for you to answer.
rem Close this window to stop it. Nothing you asked for runs while it is closed; the Room says so.
cd /d "%~dp0"
if not exist "packages\connector\dist\cli.js" (
  echo Getting the connector ready. This takes a few seconds.
  call corepack pnpm connector:build
  if errorlevel 1 (
    echo.
    echo The connector could not be got ready, so it has not been started.
    echo Send the lines above to Codex so it can find out what went wrong.
    echo.
    pause
    exit /b 1
  )
)
node packages\connector\dist\cli.js watch
pause
