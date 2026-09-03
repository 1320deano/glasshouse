@echo off
rem Starts the Glasshouse Room on this computer and opens it in your browser.
rem Leave this window open while you work; close it to stop the Room.
cd /d "%~dp0"
start "" http://localhost:3000
call pnpm --filter @glasshouse/web start
