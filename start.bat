@echo off
title Starter Agent
color 0B

echo.
echo  =============================================
echo   Starter Agent - Starting Application
echo  =============================================
echo.

set "ROOT=%~dp0"

:: Auto-install if node_modules missing
if not exist "%ROOT%backend\node_modules" (
    color 0E
    echo  [WARN] Backend node_modules not found. Running install first...
    echo.
    color 0B
    call "%ROOT%install.bat"
    if %errorlevel% neq 0 exit /b 1
    color 0B
    echo.
)

if not exist "%ROOT%frontend\node_modules" (
    color 0E
    echo  [WARN] Frontend node_modules not found. Running install first...
    echo.
    color 0B
    call "%ROOT%install.bat"
    if %errorlevel% neq 0 exit /b 1
    color 0B
    echo.
)

:: Ensure .env exists
if not exist "%ROOT%backend\.env" (
    if exist "%ROOT%.env.example" (
        copy "%ROOT%.env.example" "%ROOT%backend\.env" >nul
        echo  [OK] Created backend\.env from .env.example
    )
)

:: Ensure workspace dir exists
if not exist "%ROOT%backend\workspace" mkdir "%ROOT%backend\workspace"

echo.
echo  Starting services...
echo.
echo    Backend   ^>^>  http://localhost:3000
echo    Frontend  ^>^>  http://localhost:5173
echo.
echo  Each service opens in its own window.
echo  Close those windows to stop.
echo.

:: Launch backend in a separate window
start "Backend  - Starter Agent" cmd /k "cd /d "%ROOT%backend" && node --experimental-sqlite server.js"

:: Wait for backend to initialize
timeout /t 3 /nobreak >nul

:: Launch frontend in a separate window
start "Frontend - Starter Agent" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

:: Open browser once frontend is up
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo.
color 0A
echo  =============================================
echo   Application is running!
echo.
echo   Frontend :  http://localhost:5173
echo   Backend  :  http://localhost:3000
echo   Health   :  http://localhost:3000/api/health
echo  =============================================
echo.
pause
