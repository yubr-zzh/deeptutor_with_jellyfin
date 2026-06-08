@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ---------------------------------------------------------------------------
REM DeepTutor local server stopper
REM
REM What this file does:
REM   1. Finds the process listening on port 3000. This is the frontend.
REM   2. Finds the process listening on port 8001. This is the backend.
REM   3. Stops those processes with taskkill.
REM
REM How to use:
REM   - Double-click this file, or
REM   - Open Command Prompt in this folder and run:
REM       stop-local.cmd
REM
REM If Windows says "Access is denied", open Command Prompt as Administrator,
REM then run this file again.
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

echo.
echo ==========================================
echo  Stopping DeepTutor local development app
echo ==========================================
echo.

REM Frontend: Next.js dev server, usually opened at http://localhost:3000/chat
call :stop_port 3000 "frontend"

echo.

REM Backend: FastAPI server, usually opened at http://localhost:8001/docs
call :stop_port 8001 "backend"

echo.
echo Done. If both lines said "not running", there was nothing to stop.
echo.

endlocal
exit /b 0


REM ---------------------------------------------------------------------------
REM Helper: stop one server by port
REM
REM Arguments:
REM   %1 = port number, for example 3000
REM   %2 = friendly name, for example "frontend"
REM
REM How it works:
REM   netstat -ano        lists network connections and process IDs
REM   findstr LISTENING   keeps only servers that are waiting for connections
REM   taskkill /PID /F    stops the matching process
REM ---------------------------------------------------------------------------
:stop_port
set "PORT=%~1"
set "NAME=%~2"
set "FOUND="

echo Checking %NAME% on port %PORT%...

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    REM A port can appear more than once, so avoid killing the same PID twice.
    if not "!STOPPED_%%P!"=="1" (
        set "FOUND=1"
        set "STOPPED_%%P=1"

        echo   Found %NAME% process: PID %%P
        echo   Stopping PID %%P...

        taskkill /PID %%P /F >nul 2>nul

        if errorlevel 1 (
            echo   Failed to stop PID %%P. Try running this file as Administrator.
        ) else (
            echo   Stopped PID %%P.
        )
    )
)

if not defined FOUND (
    echo   %NAME% is not running on port %PORT%.
)

exit /b 0
