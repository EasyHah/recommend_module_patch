@echo off
setlocal

rem ================================
rem One-click stop (TEMPLATE)
rem Fill in paths below, then run.
rem ================================

set "NGINX_HOME=__PUT_YOUR_NGINX_HOME_HERE__"
set "BACKEND_PORT=3000"

echo [1/2] Stop nginx...
if exist "%NGINX_HOME%\\nginx.exe" (
  "%NGINX_HOME%\\nginx.exe" -p "%NGINX_HOME%" -c conf\\nginx.conf -s stop >nul 2>nul
  echo ok
) else (
  echo skip (nginx.exe not found)
)

echo [2/2] Stop backend on port %BACKEND_PORT% (best-effort)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%BACKEND_PORT% .*LISTENING"') do (
  echo taskkill /PID %%p /F
  taskkill /PID %%p /F >nul 2>nul
)

echo Done.
pause

