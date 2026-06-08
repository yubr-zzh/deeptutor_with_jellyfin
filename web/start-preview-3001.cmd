@echo off
cd /d "%~dp0"
set PORT=3001
if not exist ".logs" mkdir ".logs"

:restart
echo [%date% %time%] starting DeepTutor Plus preview on port %PORT% >> ".logs\preview-3001-watch.log"
node preview-server.mjs >> ".logs\preview-3001-watch.log" 2>&1
echo [%date% %time%] preview server exited with code %errorlevel%; restarting in 2s >> ".logs\preview-3001-watch.log"
ping -n 3 127.0.0.1 >nul
goto restart
