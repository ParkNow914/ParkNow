# Parâmetros de conexão com o banco de dados
$env:PGPASSWORD = "91827364Now#"
$env:PGUSER = "postgres"
$env:PGHOST = "localhost"
$env:PGPORT = "5432"
$env:PGDATABASE = "parknow_db"

# Diretório de backup
$backupDir = "$PSScriptRoot\backups"

# Criar diretório de backup se não existir
if (-not (Test-Path -Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

# Nome do arquivo de backup com data e hora
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "$backupDir\backup_parknow_${timestamp}.sql"

# Caminho para o executável pg_dump
$pgDumpPath = "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"

# Verificar se o pg_dump existe
if (-not (Test-Path $pgDumpPath)) {
    # Tentar encontrar o pg_dump no PATH
    $pgDumpPath = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
    
    if (-not $pgDumpPath) {
        Write-Error "pg_dump não encontrado. Verifique se o PostgreSQL está instalado e o pg_dump está no PATH."
        exit 1
    }
}

try {
    # Comando para fazer o backup
    & $pgDumpPath --format=custom --file="$backupFile" --no-owner --no-acl --verbose
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Backup criado com sucesso: $backupFile" -ForegroundColor Green
        
        # Manter apenas os 5 backups mais recentes
        $backups = Get-ChildItem -Path $backupDir -Filter "backup_parknow_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5
        foreach ($oldBackup in $backups) {
            Remove-Item -Path $oldBackup.FullName -Force
            Write-Host "Backup antigo removido: $($oldBackup.FullName)" -ForegroundColor Yellow
        }
    } else {
        Write-Error "Erro ao criar o backup. Código de saída: $LASTEXITCODE"
    }
} catch {
    Write-Error "Erro ao executar o backup: $_"
    exit 1
} finally {
    # Limpar a senha da memória
    Remove-Item Env:\PGPASSWORD
}

# Manter o console aberto para visualização
Write-Host "Pressione qualquer tecla para continuar..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
