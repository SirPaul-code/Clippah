@echo off
setlocal
cd /d "%~dp0"
REM This is the MCP executable/command for non-technical users and agent hosts.
REM It bootstraps missing local dependencies automatically.
call "%~dp0start.cmd"
