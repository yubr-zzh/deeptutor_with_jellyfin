@echo off
setlocal EnableExtensions

REM ---------------------------------------------------------------------------
REM DeepTutor backend starter
REM
REM What this file does:
REM   1. Moves to the project root.
REM   2. Checks whether the backend is already running on port 8001.
REM   3. Starts the FastAPI backend with the local Python virtual environment.
REM   4. Writes logs into the .logs folder.
REM
REM How to use:
REM   - Double-click this file, or
REM   - Open Command Prompt in this folder and run:
REM       start-backend-local.cmd
REM
REM Expected backend URL:
REM   http://localhost:8001/docs
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

if not exist ".logs" mkdir ".logs"

echo.
echo ======================================
echo  Starting DeepTutor backend
echo ======================================
echo.

REM If the docs page answers, the backend is already running.
powershell -NoProfile -Command "try { if ((Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8001/docs' -TimeoutSec 2).StatusCode -eq 200) { exit 0 } } catch { exit 1 }"

if "%ERRORLEVEL%"=="0" (
    echo Backend is already running:
    echo   http://localhost:8001/docs
    echo.
    exit /b 0
)

REM Make the log file name unique so older logs are not overwritten.
set "STAMP=%RANDOM%-%RANDOM%"
set "OUT_LOG=.logs\backend-local-%STAMP%.out.log"
set "ERR_LOG=.logs\backend-local-%STAMP%.err.log"

echo Backend is starting...
echo Logs:
echo   %OUT_LOG%
echo   %ERR_LOG%
echo.
echo Keep this window open while using the backend.
echo Use stop-local.cmd when you want to stop both frontend and backend.
echo.

".venv\Scripts\python.exe" -m deeptutor serve > "%OUT_LOG%" 2> "%ERR_LOG%"

endlocal
