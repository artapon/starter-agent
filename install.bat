@echo off
setlocal enabledelayedexpansion
title Starter Agent - Install
color 0B

echo.
echo  =============================================
echo   Starter Agent - Dependency Installation
echo  =============================================
echo.

:: ── Check Node.js ─────────────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo          Download it from: https://nodejs.org
    echo          Minimum required version: v22.5
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER%

:: Parse major version number (strip leading 'v')
set "VER_DIGITS=%NODE_VER:v=%"
for /f "tokens=1 delims=." %%a in ("%VER_DIGITS%") do set "NODE_MAJOR=%%a"
for /f "tokens=2 delims=." %%a in ("%VER_DIGITS%") do set "NODE_MINOR=%%a"

if %NODE_MAJOR% LSS 22 (
    color 0C
    echo  [ERROR] Node.js v22.5 or later is required (found %NODE_VER%).
    echo          The built-in node:sqlite module requires Node 22.5+.
    echo          Download from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
if %NODE_MAJOR% EQU 22 (
    if %NODE_MINOR% LSS 5 (
        color 0C
        echo  [ERROR] Node.js v22.5 or later is required (found %NODE_VER%).
        echo          The built-in node:sqlite module requires Node 22.5+.
        echo          Download from: https://nodejs.org
        echo.
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo  [OK] npm v%NPM_VER%
echo.

:: Save the project root
set "ROOT=%~dp0"

:: ── Root ──────────────────────────────────────────────────────────────────────
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

:: ── Environment ───────────────────────────────────────────────────────────────
if not exist "%ROOT%backend\.env" (
    if exist "%ROOT%.env.example" (
        copy "%ROOT%.env.example" "%ROOT%backend\.env" >nul
        echo  [OK] Created backend\.env from .env.example
        echo       Edit backend\.env to set your LM Studio model names.
    ) else (
        color 0E
        echo  [WARN] No .env.example found. Create backend\.env manually.
        color 0B
    )
) else (
    echo  [OK] backend\.env already exists — skipped.
)

:: ── Workspace dir ─────────────────────────────────────────────────────────────
if not exist "%ROOT%backend\workspace" (
    mkdir "%ROOT%backend\workspace"
    echo  [OK] Created backend\workspace\
) else (
    echo  [OK] backend\workspace\ already exists — skipped.
)

:: ── Reports dir ───────────────────────────────────────────────────────────────
if not exist "%ROOT%reports" (
    mkdir "%ROOT%reports"
    echo  [OK] Created reports\
)

echo.
color 0A
echo  =============================================
echo   Installation complete!
echo.
echo   Next steps:
echo    1. Start LM Studio and load a model
echo    2. Enable the Local Server in LM Studio
echo    3. Edit backend\.env if needed
echo    4. Run start.bat to launch the application
echo  =============================================
echo.
if /i not "%~1"=="nopause" pause
