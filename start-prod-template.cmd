@echo off
setlocal enabledelayedexpansion

rem ================================
rem One-click start (TEMPLATE)
rem Fill in paths below, then run.
rem ================================

rem ---- Required: Nginx install dir (contains nginx.exe, conf\nginx.conf, logs\) ----
set "NGINX_HOME=__PUT_YOUR_NGINX_HOME_HERE__"

rem ---- Required: Backend project dir (contains package.json, server\lke-token-server.mjs, .env.local) ----
set "BACKEND_DIR=__PUT_YOUR_BACKEND_DIR_HERE__"

rem ---- Optional: Backend entry (relative to BACKEND_DIR) ----
set "BACKEND_ENTRY=server\\lke-token-server.mjs"

rem ---- Optional: Backend port (only used by stop script; keep in sync with your .env.local) ----
set "BACKEND_PORT=3000"

rem -------------------- Start backend --------------------
if not exist "%BACKEND_DIR%" (
  echo [error] BACKEND_DIR not found: "%BACKEND_DIR%"
  exit /b 1
)
if not exist "%BACKEND_DIR%\\%BACKEND_ENTRY%" (
  echo [error] Backend entry not found: "%BACKEND_DIR%\\%BACKEND_ENTRY%"
  exit /b 1
)
if not exist "%BACKEND_DIR%\\.env.local" (
  echo [warn] "%BACKEND_DIR%\\.env.local" not found. Create it first (must include DEEPSEEK_API_KEY if using AI chat).
)

pushd "%BACKEND_DIR%" || exit /b 1
if not exist "node_modules\\" (
  echo [info] Installing backend deps (first run)...
  call npm install --omit=dev
  if errorlevel 1 (
    popd
    exit /b 1
  )
)
popd

echo [info] Starting backend in a new window...
start "recommend-backend" /D "%BACKEND_DIR%" cmd /k "node %BACKEND_ENTRY%"

rem -------------------- Start / reload nginx --------------------
if not exist "%NGINX_HOME%\\nginx.exe" (
  echo [error] nginx.exe not found: "%NGINX_HOME%\\nginx.exe"
  exit /b 1
)
if not exist "%NGINX_HOME%\\conf\\nginx.conf" (
  echo [error] nginx.conf not found: "%NGINX_HOME%\\conf\\nginx.conf"
  exit /b 1
)

echo [info] Validating nginx config...
"%NGINX_HOME%\\nginx.exe" -p "%NGINX_HOME%" -c conf\\nginx.conf -t
if errorlevel 1 exit /b 1

echo [info] Reloading nginx (or starting if not running)...
"%NGINX_HOME%\\nginx.exe" -p "%NGINX_HOME%" -c conf\\nginx.conf -s reload >nul 2>nul
if errorlevel 1 (
  "%NGINX_HOME%\\nginx.exe" -p "%NGINX_HOME%" -c conf\\nginx.conf
)

echo.
echo Done.
echo - Frontend:   http://127.0.0.1:8010/
echo - Backend:    http://127.0.0.1:%BACKEND_PORT%/health
echo.
pause

