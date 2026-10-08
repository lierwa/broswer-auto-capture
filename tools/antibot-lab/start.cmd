@echo off
cd /d "%~dp0..\.."
call npm run antibot:lab -- start
if errorlevel 1 pause
