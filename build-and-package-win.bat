@echo off
setlocal

cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd non trovato. Installa Node.js e riprova.
  exit /b 1
)

echo [1/3] Installazione dipendenze...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto :error

echo [2/3] Build progetto + packaging exe...
call npm.cmd run exe:win
if errorlevel 1 goto :error

if not exist "dist" mkdir "dist"
if not exist "dist\data" mkdir "dist\data"
xcopy "app\dist" "dist\app-dist\" /E /I /Y >nul

echo [3/3] Completato.
echo EXE server: dist\curse-run-server.exe
echo EXE launcher: dist\curse-run-launcher.exe
echo Avvio server: dist\curse-run-server.exe
echo Avvio launcher: dist\curse-run-launcher.exe
exit /b 0

:error
echo [ERROR] Build/packaging fallito.
exit /b 1
