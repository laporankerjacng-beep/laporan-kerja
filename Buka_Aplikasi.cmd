@echo off
cd /d "%~dp0"
start "" "http://localhost:3000"
"C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64\node.exe" server.js
pause
