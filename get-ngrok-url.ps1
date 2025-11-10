# Script para obter URL do ngrok
Write-Host ""
Write-Host "========================================"  -ForegroundColor Green
Write-Host "  Buscando URL do ngrok..."  -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 2

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels"
    $httpsUrl = ($response.tunnels | Where-Object { $_.proto -eq 'https' }).public_url
    
    if ($httpsUrl) {
        Write-Host "NGROK ATIVO!"  -ForegroundColor Green
        Write-Host ""
        Write-Host "URL Publica:"  -ForegroundColor Cyan
        Write-Host $httpsUrl  -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Cole esta URL no webhook do Asaas:"  -ForegroundColor Cyan
        Write-Host "$httpsUrl/api/webhooks/asaas"  -ForegroundColor Yellow
        Write-Host ""
        
        # Copiar para clipboard
        "$httpsUrl/api/webhooks/asaas" | Set-Clipboard
        Write-Host "URL copiada para a area de transferencia!"  -ForegroundColor Green
    } else {
        Write-Host "Ngrok nao esta pronto ainda."  -ForegroundColor Yellow
    }
} catch {
    Write-Host "Erro: Ngrok nao esta rodando."  -ForegroundColor Red
    Write-Host ""
    Write-Host "Abra um novo terminal e execute:"  -ForegroundColor Yellow
    Write-Host "ngrok http 3000"  -ForegroundColor Cyan
}

Write-Host ""
Read-Host "Pressione Enter para sair"
