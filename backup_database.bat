@echo off
set PGPASSWORD=91827364Now#
set BACKUP_DIR=backups

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f "tokens=1-4 delims=/ " %%a in ('date /t') do (
    set DATE=%%d%%b%%c
)
for /f "tokens=1-3 delims=:." %%a in ('time /t') do (
    set TIME=%%a%%b%%c
)

set TIMESTAMP=%DATE%_%TIME%

echo Criando backup do banco de dados...
pg_dump -U postgres -h localhost -p 5432 -d parknow_db -F c -f "%BACKUP_DIR%\backup_%TIMESTAMP%.dump"

if %ERRORLEVEL% EQU 0 (
    echo Backup concluido com sucesso: %BACKUP_DIR%\backup_%TIMESTAMP%.dump
) else (
    echo Erro ao criar o backup.
)

set PGPASSWORD=
