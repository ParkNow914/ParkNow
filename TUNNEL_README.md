# 🌐 ParkNow - Túnel LocalTunnel

Alternativa gratuita ao ngrok para expor sua aplicação local na internet.

## 🚀 Como Usar

### Opção 1: Servidor + Túnel (Recomendado)
```bash
npm run dev-tunnel
```
- Inicia servidor E túnel simultaneamente
- URL automática: `https://parknow-tunnel.loca.lt`
- Pronto para produção imediata

### Opção 2: Túnel Rápido (Subdomain Fixo)
```bash
npm run tunnel-local
```
- Cria túnel automaticamente na porta 3000
- Usa subdomain `parknow-tunnel`
- URL: `https://parknow-tunnel.loca.lt`

### Opção 3: Túnel Personalizado (Interativo)
```bash
npm run tunnel-setup
```
- Permite escolher porta e subdomain
- Interface interativa
- Mais opções de configuração

### Opção 4: Túnel Manual
```bash
node criar-tunnel.js
```
- Mesmo que a opção 2, mas executa diretamente

## 📋 Configuração para Webhooks ASAAS

1. **Execute o túnel:**
   ```bash
   npm run dev-tunnel
   ```

2. **Copie a URL gerada** (exemplo: `https://parknow-tunnel.loca.lt`)

3. **Configure no ASAAS:**
   - Acesse [ASAAS Sandbox](https://sandbox.asaas.com)
   - Vá em **Configurações → Integrações → Webhooks**
   - **URL:** `https://parknow-tunnel.loca.lt/api/webhooks/asaas`
   - **Eventos:** `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`
   - **Ativo:** Sim

## 🔧 Solução de Problemas

### Subdomain já em uso
- Escolha outro nome quando perguntado
- Ou use a opção interativa: `npm run tunnel-setup`

### Porta ocupada
- Verifique se a porta está correta e livre
- Ou especifique outra porta na configuração interativa

### Conexão instável
- LocalTunnel é gratuito, pode ter instabilidade
- Considere usar ngrok para produção

## 📚 Comandos Disponíveis

```bash
npm run dev-tunnel     # Servidor + túnel (recomendado)
npm run tunnel-local   # Túnel rápido
npm run tunnel-setup   # Túnel personalizado
npm run dev           # Apenas servidor
```

## 🎯 Benefícios

- ✅ **Gratuito** - Sem custos
- ✅ **Fácil de usar** - Scripts prontos
- ✅ **HTTPS** - URLs seguras
- ✅ **Compatível** - Funciona com ASAAS
- ✅ **Local** - Usa módulos já instalados
- ✅ **Automático** - Servidor + túnel juntos