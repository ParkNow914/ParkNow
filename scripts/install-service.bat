@echo off
echo Installing ParkNow Database Backup Service...
cd /d "%~dp0"

:: Install required dependencies
npm install node-windows --save

:: Install the service
node -e "const { exec } = require('child_process'); require('dotenv').config(); const { createWindowsService } = require('./databaseBackup'); createWindowsService().install();"

echo Service installed and will start automatically. Check logs in the logs directory.
pause
