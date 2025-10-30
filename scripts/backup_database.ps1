# Script de backup do banco de dados PostgreSQL
# Configurações
$backupDir = "$PSScriptRoot\..\backups"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "$backupDir\parknow_backup_${timestamp}.sql"

# Configurações do banco de dados
$dbHost = "localhost"
$dbPort = "5432"
$dbName = "parknow_db"
$dbUser = "postgres"
$dbPass = "91827364Now#"

# Criar diretório de backup se não existir
if (-not (Test-Path -Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
    Write-Host "Diretório de backup criado: $backupDir"
}

try {
    # Definir a variável de ambiente para a senha do PostgreSQL
    $env:PGPASSWORD = $dbPass
    
    # Comando pg_dump
    $pgDumpCmd = "pg_dump"
    $pgDumpArgs = @(
        "-h", $dbHost,
        "-p", $dbPort,
        "-U", $dbUser,
        "-d", $dbName,
        "-F", "c",  # Formato customizado (compactado)
        "-b",        # Inclui blobs
        "-v",        # Modo verboso
        "-f", $backupFile
    )
    
    Write-Host "Iniciando backup do banco de dados..."
    Write-Host "Arquivo de saída: $backupFile"
    
    # Executar o comando pg_dump
    & $pgDumpCmd @pgDumpArgs
    
    if ($LASTEXITCODE -eq 0) {
        $fileSize = (Get-Item $backupFile).Length / 1MB
        Write-Host "Backup concluído com sucesso! Tamanho: $($fileSize.ToString('0.00')) MB" -ForegroundColor Green
        Write-Host "Arquivo salvo em: $backupFile"
    } else {
        throw "Erro ao executar pg_dump. Código de saída: $LASTEXITCODE"
    }
} catch {
    Write-Host "Erro durante o backup: $_" -ForegroundColor Red
    exit 1
} finally {
    # Limpar a senha da memória
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# Manter apenas os 5 backups mais recentes
$backups = Get-ChildItem -Path $backupDir -Filter "parknow_backup_*.sql" | Sort-Object LastWriteTime -Descending
if ($backups.Count -gt 5) {
    $backups | Select-Object -Skip 5 | Remove-Item -Force
    Write-Host "Backups antigos removidos, mantendo apenas os 5 mais recentes."
}

Write-Host "Processo de backup finalizado."
