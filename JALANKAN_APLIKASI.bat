@echo off
cd /d "%~dp0"
title Sistem Laporan Kerja Lapangan

echo ========================================================
echo   MEMULAI SISTEM LAPORAN KERJA LAPANGAN
echo   - Alamat: http://localhost:3000
echo ========================================================
echo.

set "NODE_DIR=C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64"

:: Buka browser setelah delay 1 detik agar server siap
start "" "http://localhost:3000"

if exist "%NODE_DIR%\node.exe" (
    "%NODE_DIR%\node.exe" server.js
) else (
    node server.js
)

pause
