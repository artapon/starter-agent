@echo off
title Starter Agent - Install
color 0B

echo.
echo  =============================================
echo   Starter Agent - Dependency Installation
echo  =============================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Download it from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER%

for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo  [OK] npm v%NPM_VER%
echo.

:: Save the project root
set "ROOT=%~dp0"

:: ── Root ─────────────────────────────────────────────────────────────────────
echo  [1/3] Installing root dependencies...
cd /d "%ROOT%"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Root install failed.
    pause
    exit /b 1
)
echo  [OK] Root done.
echo.

:: ── Backend ───────────────────────────────────────────────────────────────────
echo  [2/3] Installing backend dependencies...
cd /d "%ROOT%backend"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Backend install failed.
    pause
    exit /b 1
)
echo  [OK] Backend done.
echo.

:: ── Frontend ──────────────────────────────────────────────────────────────────
echo  [3/3] Installing frontend dependencies...
cd /d "%ROOT%frontend"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Frontend install failed.
    pause
    exit /b 1
)
echo  [OK] Frontend done.
echo.

:: Back to root
cd /d "%ROOT%"

:: Copy .env if missing
if not exist "%ROOT%backend\.env" (
    if exist "%ROOT%.env.example" (
        copy "%ROOT%.env.example" "%ROOT%backend\.env" >nul
        echo  [OK] Created backend\.env from .env.example
    )
)

:: Create workspace dir
if not exist "%ROOT%backend\workspace" (
    mkdir "%ROOT%backend\workspace"
    echo  [OK] Created backend\workspace\
)

echo.
color 0A
echo  =============================================
echo   Installation complete!
echo   Run start.bat to launch the application.
echo  =============================================
echo.
if /i not "%~1"=="nopause" pause
