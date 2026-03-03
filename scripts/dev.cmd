@echo off
cd /d %~dp0..
pnpm dev
echo.
echo Press any key to close...
pause >nul