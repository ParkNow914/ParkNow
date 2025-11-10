# ========================================
#          INSTRUÇÕES NGROK
# ========================================

## PASSO 1: Abrir novo terminal
1. Abra um NOVO terminal PowerShell
2. Navegue até a pasta do projeto

## PASSO 2: Iniciar ngrok
Execute o comando:
```
ngrok http 3000
```

## PASSO 3: Copiar URL
Você verá algo assim:

```
Session Status                online
Account                       Free account
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok-free.app -> http://localhost:3000
```

**COPIE a URL HTTPS** (exemplo: `https://abc123.ngrok-free.app`)

## PASSO 4: Configurar no Asaas
Cole no webhook do Asaas:
```
https://abc123.ngrok-free.app/api/webhooks/asaas
```

## PASSO 5: Manter ngrok rodando
NÃO FECHE a janela do ngrok!
Ele precisa ficar rodando enquanto você testa.

---

## 🚀 COMANDO RÁPIDO:
```powershell
ngrok http 3000
```

## ✅ DEPOIS DE CONFIGURAR:
Execute para verificar:
```powershell
.\get-ngrok-url.ps1
```
