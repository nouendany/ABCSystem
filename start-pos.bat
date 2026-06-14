@echo off
title Antigravity POS Launcher
echo ====================================================
echo             ANTIGRAVITY POS LAUNCHER
echo ====================================================
echo.
echo [1] Checking Node.js runtime status...

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo.
    echo [+] Node.js detected!
    echo [+] Starting premium local web server on port 5000...
    echo.
    echo [2] Launching web browser at http://localhost:5000 ...
    start "" "http://localhost:5000"
    
    echo.
    echo [*] Press Ctrl+C in this window to stop the POS server.
    echo.
    npx --yes serve -l 5000 .
) else (
    echo.
    echo [-] Node.js is installed but PATH is not yet refreshed in this terminal session.
    echo [+] Opening the POS application directly via standard secure local file protocol...
    echo.
    echo [2] Launching web browser...
    start "" "index.html"
    echo.
    echo [+] Done! Enjoy your offline premium POS system!
    echo.
    pause
)
