@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "SESSION_FILE=%ROOT%\running-session.json"
set "LOG_DIR=%ROOT%\logs"
set "SERVER_PORT=5174"
set "DEV_PORT=5173"
set "BACKEND_DIR=%ROOT%\backend"
set "FRONTEND_DIR=%ROOT%\frontend"
set "DIST_DIR=%FRONTEND_DIR%\dist"
set "BACKEND_VENV=%BACKEND_DIR%\.venv"

if "%~1"=="" goto usage
if /I "%~1"=="help" goto usage
if /I "%~1"=="-h" goto usage
if /I "%~1"=="--help" goto usage
if /I "%~1"=="start" goto cmd_start
if /I "%~1"=="stop" goto cmd_stop
if /I "%~1"=="status" goto cmd_status
echo error: unknown command %~1 >&2
goto usage

:usage
echo Usage: %~nx0 ^<start^|stop^|status^> [options]
echo.
echo   start   Default prod: one server on :%SERVER_PORT% (UI + /api)
echo           --build   npm run build then start prod
echo           --dev     Vite :%DEV_PORT% + API :%SERVER_PORT%
echo           -f PATH   Open workspace folder
echo           -p PATH   Open project.json
echo   stop    Stop recorded session
echo   status  Show session state
exit /b 1

:die
echo error: %~1 >&2
exit /b 1

:ensure_backend
if not exist "%BACKEND_VENV%\Scripts\python.exe" (
  call :die "backend venv missing. Run: cd backend && python -m venv .venv && .venv\Scripts\pip install -e .[dev]"
)
exit /b 0

:ensure_dist
if not exist "%DIST_DIR%\index.html" (
  call :die "frontend/dist missing. Run: %~nx0 start --build"
)
exit /b 0

:run_frontend_build
where npm >nul 2>&1 || call :die "npm not found"
if not exist "%FRONTEND_DIR%\node_modules\" (
  echo installing frontend dependencies...
  pushd "%FRONTEND_DIR%"
  call npm install || (popd & call :die "npm install failed")
  popd
)
echo building frontend...
pushd "%FRONTEND_DIR%"
call npm run build || (popd & call :die "npm run build failed")
popd
call :ensure_dist
exit /b 0

:port_in_use
set "CHECK_PORT=%~1"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%CHECK_PORT% .*LISTENING"') do exit /b 0
exit /b 1

:cmd_start
set "MODE=prod"
set "DO_BUILD=0"
set "BACKEND_EXTRA="
shift
:parse_start
if "%~1"=="" goto start_run
if /I "%~1"=="--build" set "DO_BUILD=1" & shift & goto parse_start
if /I "%~1"=="--dev" set "MODE=dev" & shift & goto parse_start
if /I "%~1"=="-f" (
  if "%~2"=="" call :die "-f requires a path"
  set "BACKEND_EXTRA=-f %~2"
  shift
  shift
  goto parse_start
)
if /I "%~1"=="--folder" (
  if "%~2"=="" call :die "--folder requires a path"
  set "BACKEND_EXTRA=-f %~2"
  shift
  shift
  goto parse_start
)
if /I "%~1"=="-p" (
  if "%~2"=="" call :die "-p requires a path"
  set "BACKEND_EXTRA=-p %~2"
  shift
  shift
  goto parse_start
)
if /I "%~1"=="--project" (
  if "%~2"=="" call :die "--project requires a path"
  set "BACKEND_EXTRA=-p %~2"
  shift
  shift
  goto parse_start
)
call :die "unknown start option %~1"

:start_run
if "%DO_BUILD%"=="1" if /I "%MODE%"=="dev" call :die "--build and --dev cannot be combined"
call :ensure_backend
if "%DO_BUILD%"=="1" call :run_frontend_build
if /I "%MODE%"=="prod" call :ensure_dist
if /I "%MODE%"=="dev" (
  where npm >nul 2>&1 || call :die "npm not found for --dev"
  if not exist "%FRONTEND_DIR%\node_modules\" call :die "frontend deps missing. Run: cd frontend && npm install"
)
call :port_in_use %SERVER_PORT% && call :die "port %SERVER_PORT% is already in use"
if /I "%MODE%"=="dev" call :port_in_use %DEV_PORT% && call :die "port %DEV_PORT% is already in use"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if /I "%MODE%"=="prod" goto start_prod
goto start_dev

:start_prod
set "SYSMLVIEWER_STATIC_DIR=%DIST_DIR%"
pushd "%BACKEND_DIR%"
start "sysmlviewer-backend" /B cmd /c ""%BACKEND_VENV%\Scripts\python.exe" -m cli --host 127.0.0.1 --port %SERVER_PORT% --reload %BACKEND_EXTRA% > "%LOG_DIR%\backend.log" 2>&1"
popd
timeout /t 2 /nobreak >nul
echo started (prod)
echo   UI:  http://127.0.0.1:%SERVER_PORT%/
echo   API: http://127.0.0.1:%SERVER_PORT%/api/docs
exit /b 0

:start_dev
pushd "%BACKEND_DIR%"
start "sysmlviewer-backend" /B cmd /c "set SYSMLVIEWER_STATIC_DIR=& "%BACKEND_VENV%\Scripts\python.exe" -m cli --host 127.0.0.1 --port %SERVER_PORT% --reload %BACKEND_EXTRA% > "%LOG_DIR%\backend.log" 2>&1"
popd
pushd "%FRONTEND_DIR%"
start "sysmlviewer-frontend" /B cmd /c "npm run dev -- --host 127.0.0.1 --port %DEV_PORT% > "%LOG_DIR%\frontend.log" 2>&1"
popd
timeout /t 2 /nobreak >nul
echo started (dev)
echo   UI:  http://127.0.0.1:%DEV_PORT%/
echo   API: http://127.0.0.1:%SERVER_PORT%/api/docs
exit /b 0

:cmd_stop
echo stopping session (best effort)...
taskkill /FI "WINDOWTITLE eq sysmlviewer-backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq sysmlviewer-frontend*" /T /F >nul 2>&1
if exist "%SESSION_FILE%" del /f "%SESSION_FILE%" >nul 2>&1
echo stopped
exit /b 0

:cmd_status
if not exist "%SESSION_FILE%" (
  echo status: stopped (no session file)
  exit /b 0
)
echo status: session file present (see %SESSION_FILE%)
exit /b 0
