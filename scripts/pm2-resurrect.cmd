@echo off
cd /d "%~dp0.."
cmd /c npx pm2 resurrect
