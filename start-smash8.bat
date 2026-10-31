@echo off
rem SMASH 8 — local play. Serves the game on http://127.0.0.1:8111 and opens it.
cd /d "%~dp0"
start "" /min cmd /c "python -m http.server 8111 --bind 0.0.0.0"
timeout /t 2 >nul
start "" http://127.0.0.1:8111/
