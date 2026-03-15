@echo off
setlocal enabledelayedexpansion
title Starter Agent
color 0B

echo.
echo  =============================================
echo   Starter Agent - Starting Application
echo  =============================================
echo.

set "ROOT=%~dp0"

:: Auto-install if node_modules missing
set "NEED_INSTALL=0"
if not exist "%ROOT%backend\node_modules"  set "NEED_INSTALL=1"
if not exist "%ROOT%frontend\node_modules" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="1" (
    color 0E
    echo  [WARN] Dependencies not found. Running install first...
    echo.
    color 0B
    :: Call install.bat without its trailing pause
    call "%ROOT%install.bat" nopause
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

:: Wait for backend to be ready (poll /api/health up to 30s)
echo  Waiting for backend...
set "BACKEND_READY=0"
for /l %%i in (1,1,30) do (
    if "!BACKEND_READY!"=="0" (
        curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/health 2>nul | findstr /x "200" >nul 2>&1
        if not errorlevel 1 (
            set "BACKEND_READY=1"
            echo  [OK] Backend is ready.
        ) else (
            timeout /t 1 /nobreak >nul
        )
    )
)
if "!BACKEND_READY!"=="0" (
    color 0E
    echo  [WARN] Backend did not respond in 30s, starting frontend anyway...
    color 0B
)

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
