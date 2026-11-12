@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\start.ps1" %*
if errorlevel 1 (
  echo.
  echo Startup failed. Review the error above.
  pause
  exit /b 1
)
echo.
pause
