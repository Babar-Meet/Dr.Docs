@echo off
SETLOCAL EnableDelayedExpansion

echo ==========================================
echo Dr.Docs - Environment Setup
echo ==========================================

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed. Please install it from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Installing root dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed.
    goto :failed
)

echo [2/4] Setting up server environment...
if not exist "server\.env" (
    copy "server\.env.example" "server\.env"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create server/.env from template.
        goto :failed
    )
    echo Created default server/.env file.
) else (
    echo server/.env already exists.
)

echo [3/4] Checking for qpdf...
where qpdf >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARNING] qpdf not found in PATH. PDF unlocking will fail.
    echo Please install qpdf (e.g., via 'choco install qpdf' or manual download).
) else (
    echo qpdf found.
)

echo [4/4] Checking for LibreOffice (soffice)...
where soffice >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARNING] LibreOffice (soffice) not found in PATH.
    echo Document conversions may fail unless LIBREOFFICE_BIN is set in server/.env.
) else (
    echo LibreOffice found.
)

echo ==========================================
echo Setup Complete!
echo You can now use 'start.bat' to run the app.
echo ==========================================
pause
exit /b 0

:failed
echo ==========================================
echo Setup Failed.
echo Please fix the above error and run setup again.
echo ==========================================
pause
exit /b 1
