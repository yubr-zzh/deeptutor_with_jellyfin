@echo off
setlocal EnableExtensions

REM ---------------------------------------------------------------------------
REM DeepTutor frontend starter
REM
REM What this file does:
REM   1. Moves to the web folder.
REM   2. Checks whether the frontend is already running on port 3000.
REM   3. Starts the Next.js development server.
REM   4. Writes logs into web\.logs.
REM
REM How to use:
REM   - Double-click this file, or
REM   - Open Command Prompt in the project root and run:
REM       start-frontend-local.cmd
REM
REM Expected frontend URL:
REM   http://localhost:3000/chat
REM ---------------------------------------------------------------------------

cd /d "%~dp0web"

if not exist ".logs" mkdir ".logs"

echo.
echo ======================================
echo  Starting DeepTutor frontend
echo ======================================
echo.

REM If the chat page answers, the frontend is already running.
powershell -NoProfile -Command "try { if ((Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/chat' -TimeoutSec 2).StatusCode -eq 200) { exit 0 } } catch { exit 1 }"

if "%ERRORLEVEL%"=="0" (
    echo Frontend is already running:
    echo   http://localhost:3000/chat
    echo.
    exit /b 0
)

REM Make the log file name unique so older logs are not overwritten.
set "STAMP=%RANDOM%-%RANDOM%"
set "OUT_LOG=.logs\next-dev-local-%STAMP%.out.log"
set "ERR_LOG=.logs\next-dev-local-%STAMP%.err.log"

echo Frontend is starting...
echo Logs:
echo   %OUT_LOG%
echo   %ERR_LOG%
echo.
echo Keep this window open while using the frontend.
echo Use ..\stop-local.cmd when you want to stop both frontend and backend.
echo.

npm run dev > "%OUT_LOG%" 2> "%ERR_LOG%"

endlocal
