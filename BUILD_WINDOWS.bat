@echo off
setlocal
cd /d "%~dp0"

echo.
echo ================================
echo   Aural Field Windows Builder
echo ================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js/npm is not installed.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo ERROR: Rust/Cargo is not installed.
  echo Install Rust using: winget install --id Rustlang.Rustup
  echo Then restart your terminal/computer and run this file again.
  pause
  exit /b 1
)

echo Installing Tauri CLI...
call npm install
if errorlevel 1 goto :error

echo.
echo Building Aural Field installer...
call npm run build
if errorlevel 1 goto :error

echo.
echo DONE.
echo Look in:
echo src-tauri\target\release\bundle\nsis\
echo.
pause
exit /b 0

:error
echo.
echo Build failed. Copy the error text and send it to ChatGPT.
pause
exit /b 1
