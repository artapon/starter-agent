@echo off
title Starter Agent - Restart
color 0E

echo.
echo  =============================================
echo   Starter Agent - Restarting
echo  =============================================
echo.

:: Kill any running node processes on ports 3000 / 5173
echo  Stopping running services...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING 2^>nul') do (
    taskkill //PID %%a //F >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr LISTENING 2^>nul') do (
    taskkill //PID %%a //F >nul 2>&1
)

:: Also close any CMD windows titled "Backend" or "Frontend" from a previous start
taskkill //FI "WINDOWTITLE eq Backend  - Starter Agent" //F >nul 2>&1
taskkill //FI "WINDOWTITLE eq Frontend - Starter Agent" //F >nul 2>&1

echo  [OK] Services stopped.
echo.

timeout /t 2 /nobreak >nul

:: Launch start.bat
call "%~dp0start.bat"
