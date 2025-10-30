@echo off
echo Uninstalling ParkNow Database Backup Service...
cd /d "%~dp0"

:: Uninstall the service
node -e "const { exec } = require('child_process'); require('dotenv').config(); const { createWindowsService } = require('./databaseBackup'); createWindowsService().uninstall();"

echo Service uninstalled. Press any key to exit.
pause
