# Script para adicionar PostgreSQL ao PATH permanentemente

# Caminho do diretório bin do PostgreSQL
$postgresBinPath = "C:\Program Files\PostgreSQL\17\bin"

# Verificar se o diretório existe
if (-not (Test-Path $postgresBinPath)) {
    Write-Error "O diretório do PostgreSQL não foi encontrado em: $postgresBinPath"
    exit 1
}

# Adicionar ao PATH do usuário atual
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$postgresBinPath*") {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$postgresBinPath", 'User')
    Write-Host "Adicionado ao PATH do usuário: $postgresBinPath"
} else {
    Write-Host "O diretório já está no PATH do usuário"
}

# Adicionar ao PATH do sistema (requer privilégios de administrador)
$systemPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
if ($systemPath -notlike "*$postgresBinPath*") {
    $runAsAdmin = Read-Host "Deseja adicionar ao PATH do sistema? (s/n)"
    if ($runAsAdmin -eq 's') {
        try {
            Start-Process powershell -Verb RunAs -ArgumentList "-Command", "[Environment]::SetEnvironmentVariable('Path', '$systemPath;$postgresBinPath', 'Machine')"
            Write-Host "Adicionado ao PATH do sistema: $postgresBinPath"
        } catch {
            Write-Warning "Não foi possível adicionar ao PATH do sistema. Execute como administrador."
        }
    }
} else {
    Write-Host "O diretório já está no PATH do sistema"
}

# Atualizar o PATH na sessão atual
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "`nPara aplicar as alterações, feche e reabra o terminal ou execute: `$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')"
