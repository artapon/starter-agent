@echo off
setlocal enabledelayedexpansion
title Starter Agent + ngrok
color 0B

echo.
echo  =============================================
echo   Starter Agent - Starting with ngrok
echo  =============================================
echo.

set "ROOT=%~dp0"

:: Ensure .env exists
if not exist "%ROOT%backend\.env" (
    if exist "%ROOT%.env.example" (
        copy "%ROOT%.env.example" "%ROOT%backend\.env" >nul
        echo  [OK] Created backend\.env from .env.example
    )
)

:: Ensure workspace dir exists
if not exist "%ROOT%backend\workspace" mkdir "%ROOT%backend\workspace"

echo  Starting services...
echo.
echo    Backend   >>  http://localhost:3000
echo    Frontend  >>  http://localhost:5173
echo    ngrok     >>  https://<random>.ngrok-free.app
echo.
echo  Each service opens in its own window.
echo  Close those windows to stop.
echo.

:: Launch backend
start "Backend  - Starter Agent" cmd /k "cd /d "%ROOT%backend" && node --experimental-sqlite server.js"

:: Wait for backend (up to 30s)
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
    echo  [WARN] Backend did not respond in 30s, continuing anyway...
    color 0B
)

:: Launch frontend
start "Frontend - Starter Agent" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

:: Wait for frontend (up to 20s)
echo  Waiting for frontend...
set "FRONTEND_READY=0"
for /l %%i in (1,1,20) do (
    if "!FRONTEND_READY!"=="0" (
        curl -s -o nul -w "%%{http_code}" http://localhost:5173 2>nul | findstr /x "200" >nul 2>&1
        if not errorlevel 1 (
            set "FRONTEND_READY=1"
            echo  [OK] Frontend is ready.
        ) else (
            timeout /t 1 /nobreak >nul
        )
    )
)
if "!FRONTEND_READY!"=="0" (
    color 0E
    echo  [WARN] Frontend did not respond in 20s, starting ngrok anyway...
    color 0B
)

:: Launch ngrok tunnel to frontend port
start "ngrok    - Starter Agent" cmd /k "ngrok http 5173"

:: Wait a moment then open ngrok dashboard
timeout /t 3 /nobreak >nul
start "" "http://localhost:4040"

echo.
color 0A
echo  =============================================
echo   Application is running!
echo.
echo   Frontend  :  http://localhost:5173
echo   Backend   :  http://localhost:3000
echo   ngrok UI  :  http://localhost:4040
echo.
echo   Public URL visible in the ngrok window
echo   and at http://localhost:4040
echo  =============================================
echo.
pause
