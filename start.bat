@echo off
echo ==========================================
echo Starting Dr.Docs...
echo ==========================================

echo [INFO] Building frontend...
call npm run build -w client
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b %ERRORLEVEL%
)

:: Start the application in development mode
echo [INFO] Starting Backend and Frontend...
echo [INFO] Access via http://localhost:5173

call npm run dev

if %ERRORLEVEL% neq 0 (
    echo [ERROR] An error occurred while starting the application.
    echo Please make sure you have run 'setup.bat' first.
    pause
    exit /b %ERRORLEVEL%
)

pause
