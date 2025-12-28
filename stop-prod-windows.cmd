@echo off
setlocal

rem Stop Nginx + backend (best-effort).
rem - Nginx: uses nginx -s stop
rem - Backend: kills node processes that are LISTENING on port 3000

if not defined NGINX_HOME set "NGINX_HOME=C:\Users\86159\Downloads\nginx-1.28.1\nginx-1.28.1"

echo [1/2] Stop Nginx...
if exist "%NGINX_HOME%\nginx.exe" (
  "%NGINX_HOME%\nginx.exe" -p "%NGINX_HOME%" -c conf\nginx.conf -s stop >nul 2>nul
  echo ok
) else (
  echo skip (nginx.exe not found)
)

echo [2/2] Stop backend on port 3000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do (
  echo taskkill /PID %%p /F
  taskkill /PID %%p /F >nul 2>nul
)

echo Done.
pause

