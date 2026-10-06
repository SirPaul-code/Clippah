@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Running Clippah one-click setup first... 1>&2
  call "%~dp0setup.cmd"
)
if not exist "%~dp0node_modules" (
  echo Installing Clippah MCP dependencies... 1>&2
  call npm install --omit=dev 1>&2
)
node "%~dp0server.js"
