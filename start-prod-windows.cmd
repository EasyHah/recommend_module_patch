@echo off
setlocal enabledelayedexpansion

rem One-click start: Backend (Node) + Frontend (Nginx) on the same Windows machine.
rem Requirements:
rem   - Node.js 18+ (recommended 20 LTS)
rem   - Nginx for Windows (set NGINX_HOME below or via env var)

set "REPO_ROOT=%~dp0"

rem -------- Config (edit if needed) --------
if not defined NGINX_HOME set "NGINX_HOME=C:\Users\86159\Downloads\nginx-1.28.1\nginx-1.28.1"
set "BACKEND_DIR=%REPO_ROOT%deploy_out\backend"
set "BACKEND_ENTRY=server\lke-token-server.mjs"
rem ----------------------------------------

echo [1/4] Generate minimal backend package...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\make-backend-deploy.ps1" -OutDir "deploy_out/backend" -GenerateLock
if errorlevel 1 exit /b 1

if not exist "%BACKEND_DIR%\.env.local" (
  echo [info] Creating "%BACKEND_DIR%\.env.local" from ".env.example" (please fill DEEPSEEK_API_KEY).
  copy /y "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env.local" >nul
)

echo [2/4] Install backend deps (minimal)...
pushd "%BACKEND_DIR%" || exit /b 1
if not exist "node_modules\" (
  call npm ci --omit=dev --ignore-scripts
  if errorlevel 1 (
    popd
    exit /b 1
  )
)
popd

echo [3/4] Start backend (Node) in a new window...
echo       - Backend dir: "%BACKEND_DIR%"
echo       - If port 3000 is already in use, close the old backend first.
start "recommend-backend" /D "%BACKEND_DIR%" cmd /k "node %BACKEND_ENTRY%"

echo [4/4] Validate & (re)load Nginx...
if not exist "%NGINX_HOME%\nginx.exe" (
  echo [error] nginx.exe not found: "%NGINX_HOME%\nginx.exe"
  echo         Please set env var NGINX_HOME or edit this file.
  exit /b 1
)
if not exist "%NGINX_HOME%\conf\nginx.conf" (
  echo [error] nginx.conf not found: "%NGINX_HOME%\conf\nginx.conf"
  exit /b 1
)

"%NGINX_HOME%\nginx.exe" -p "%NGINX_HOME%" -c conf\nginx.conf -t
if errorlevel 1 exit /b 1

rem If reload fails (nginx not running), start it.
"%NGINX_HOME%\nginx.exe" -p "%NGINX_HOME%" -c conf\nginx.conf -s reload >nul 2>nul
if errorlevel 1 (
  "%NGINX_HOME%\nginx.exe" -p "%NGINX_HOME%" -c conf\nginx.conf
)

echo.
echo Done:
echo   - Frontend: http://127.0.0.1:8010/
echo   - Backend health: http://127.0.0.1:3000/health
echo.
pause

