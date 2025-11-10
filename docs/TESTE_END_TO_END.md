# 🧪 Guia de Teste End-to-End - Marketplace Mercado Pago

## 📋 Pré-requisitos

1. ✅ Servidor rodando: `npm start`
2. ✅ Banco de dados PostgreSQL configurado
3. ✅ Variáveis no `.env` configuradas:
   - `MP_PLATFORM_ACCOUNT_ID` (ID do usuário MP da plataforma)
   - `MP_CLIENT_ID` (OAuth App ID)
   - `MP_CLIENT_SECRET` (OAuth App Secret)
   - `MP_ACCESS_TOKEN` (Token de acesso da plataforma)
   - `MP_PLATFORM_FEE_PERCENT=15.0`
   - `MP_MARKETPLACE_ENABLED=true`

---

## 🎯 Fluxo Completo de Teste

### **1️⃣ Conectar Estacionamento ao Mercado Pago (OAuth)**

#### Endpoint: `POST /api/marketplace/connect`

**Requisição:**
```bash
curl -X POST http://localhost:3000/api/marketplace/connect \
  -H "Authorization: Bearer <TOKEN_ADMIN_ESTACIONAMENTO>" \
  -H "Content-Type: application/json" \
  -d '{
    "estacionamento_id": 1
  }'
```

**Resposta Esperada:**
```json
{
  "success": true,
  "data": {
    "authorization_url": "https://auth.mercadopago.com.br/authorization?client_id=...",
    "estacionamento_id": 1,
    "message": "Clique no link para autorizar o Mercado Pago"
  }
}
```

**Próximos Passos:**
1. Abra o `authorization_url` no navegador
2. Faça login com a conta Mercado Pago do estacionamento
3. Autorize o acesso
4. Será redirecionado para: `http://localhost:3000/api/marketplace/callback?code=...&state=1`

---

### **2️⃣ Verificar Conexão**

#### Endpoint: `GET /api/marketplace/status/:estacionamento_id`

**Requisição:**
```bash
curl -X GET http://localhost:3000/api/marketplace/status/1 \
  -H "Authorization: Bearer <TOKEN_ADMIN_ESTACIONAMENTO>"
```

**Resposta Esperada:**
```json
{
  "success": true,
  "data": {
    "estacionamento_id": 1,
    "nome": "RealCred Stop",
    "connected": true,
    "mp_account_id": "123456789",
    "connected_at": "2025-01-10T18:30:00.000Z",
    "can_receive_payments": true,
    "message": "Estacionamento habilitado para receber pagamentos online"
  }
}
```

---

### **3️⃣ Criar Reserva com Pagamento PIX (Split Automático)**

#### Endpoint: `POST /api/reservas/com-pagamento`

**Requisição:**
```bash
curl -X POST http://localhost:3000/api/reservas/com-pagamento \
  -H "Authorization: Bearer <TOKEN_USUARIO>" \
  -H "Content-Type: application/json" \
  -d '{
    "id_estacionamento": 1,
    "data_entrada_prevista": "2025-01-15T14:00:00",
    "data_saida_prevista": "2025-01-15T18:00:00",
    "placa_veiculo": "ABC1234",
    "metodo_pagamento": "pix",
    "valor": 50.00
  }'
```

**Resposta Esperada:**
```json
{
  "success": true,
  "message": "Reserva criada com sucesso",
  "reserva": {
    "id": 10,
    "status": "pendente",
    "data_entrada_prevista": "2025-01-15T14:00:00.000Z",
    "data_saida_prevista": "2025-01-15T18:00:00.000Z"
  },
  "pagamento": {
    "id": 25,
    "valor": 50.00,
    "status": "pending",
    "metodo": "pix"
  },
  "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSU...",
  "qr_code_text": "00020126580014br.gov.bcb.pix...",
  "split": {
    "valor_total": 50.00,
    "comissao_plataforma": 7.50,
    "valor_estacionamento": 42.50,
    "percentual": 15
  }
}
```

**Verificar no Banco de Dados:**
```sql
SELECT 
  id, 
  valor, 
  comissao_plataforma, 
  valor_estacionamento, 
  payment_id, 
  status 
FROM pagamentos 
WHERE reserva_id = 10;
```

**Resultado Esperado:**
```
id | valor | comissao_plataforma | valor_estacionamento | payment_id | status
---|-------|---------------------|---------------------|------------|--------
25 | 50.00 | 7.50                | 42.50               | 123456789  | pending
```

---

### **4️⃣ Simular Pagamento PIX (Sandbox)**

**Usando Mercado Pago Sandbox:**
1. Acesse: https://www.mercadopago.com.br/developers/panel/test/payments
2. Localize o `payment_id` retornado (ex: `123456789`)
3. Simule aprovação manual ou via API:

```bash
curl -X PUT https://api.mercadopago.com/v1/payments/123456789 \
  -H "Authorization: Bearer TEST-1234567890123456..." \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved"
  }'
```

---

### **5️⃣ Receber Webhook de Confirmação**

**O Mercado Pago enviará automaticamente:**
```
POST http://localhost:3000/api/reservas/webhook-pagamento
Content-Type: application/json

{
  "id": 123456789,
  "type": "payment",
  "action": "payment.updated",
  "data": {
    "id": "123456789"
  }
}
```

**Processamento Automático:**
- ✅ Controller chama `mercadoPagoMarketplace.processarNotificacao()`
- ✅ Consulta status do pagamento no MP
- ✅ Atualiza `pagamentos.status = 'approved'`
- ✅ Atualiza `reservas.status = 'confirmada'`

---

### **6️⃣ Consultar Status do Pagamento**

#### Endpoint: `GET /api/pagamentos/:payment_id/status`

**Requisição:**
```bash
curl -X GET http://localhost:3000/api/pagamentos/123456789/status \
  -H "Authorization: Bearer <TOKEN_USUARIO>"
```

**Resposta Esperada:**
```json
{
  "success": true,
  "data": {
    "id": 25,
    "payment_id": "123456789",
    "valor": 50.00,
    "comissao_plataforma": 7.50,
    "valor_estacionamento": 42.50,
    "status": "approved",
    "metodo": "pix",
    "reserva_id": 10,
    "reserva_status": "confirmada"
  }
}
```

---

### **7️⃣ Verificar Splits no Dashboard Admin**

**Acesse:**
```
http://localhost:3000/admin/splits-dashboard.html
```

**Dados Exibidos:**
- ✅ Receita Total: R$ 7,50 (15% de R$ 50,00)
- ✅ Total de Transações: 1
- ✅ Receita Hoje: R$ 7,50
- ✅ Tabela com detalhes: ID, Data, Estacionamento, Cliente, Valores, Status

---

### **8️⃣ Listar Splits do Estacionamento**

#### Endpoint: `GET /api/marketplace/splits/:estacionamento_id`

**Requisição:**
```bash
curl -X GET "http://localhost:3000/api/marketplace/splits/1?limite=50" \
  -H "Authorization: Bearer <TOKEN_ADMIN_ESTACIONAMENTO>"
```

**Resposta Esperada:**
```json
{
  "success": true,
  "data": {
    "estacionamento": {
      "id": 1,
      "nome": "RealCred Stop"
    },
    "splits": [
      {
        "id": 25,
        "reserva_id": 10,
        "created_at": "2025-01-10T18:45:00.000Z",
        "valor_total": 50.00,
        "comissao_plataforma": 7.50,
        "valor_estacionamento": 42.50,
        "status": "approved",
        "metodo": "pix",
        "data_entrada_prevista": "2025-01-15T14:00:00.000Z",
        "data_saida_prevista": "2025-01-15T18:00:00.000Z",
        "cliente_nome": "João Silva",
        "cliente_email": "joao@email.com"
      }
    ],
    "totais": {
      "total_transacoes": 1,
      "receita_total": 50.00,
      "comissao_total": 7.50,
      "recebido_total": 42.50
    },
    "metadata": {
      "limite": 50,
      "total_retornado": 1
    }
  }
}
```

---

### **9️⃣ Desconectar Estacionamento (Opcional)**

#### Endpoint: `DELETE /api/marketplace/disconnect/:estacionamento_id`

**Requisição:**
```bash
curl -X DELETE http://localhost:3000/api/marketplace/disconnect/1 \
  -H "Authorization: Bearer <TOKEN_ADMIN_ESTACIONAMENTO>"
```

**Resposta Esperada:**
```json
{
  "success": true,
  "message": "Estacionamento desconectado com sucesso"
}
```

---

## ✅ Checklist de Validação

### **Backend**
- [ ] Servidor inicia sem erros
- [ ] Endpoint `/api/marketplace/connect` retorna URL OAuth
- [ ] Callback OAuth salva tokens no banco
- [ ] Endpoint `/api/marketplace/status` retorna conexão válida
- [ ] Criação de reserva gera PIX com split
- [ ] Webhook processa notificação MP
- [ ] Dashboard admin exibe estatísticas

### **Frontend**
- [ ] Modal PIX exibe QR Code
- [ ] Modal PIX exibe breakdown do split (15% / 85%)
- [ ] Botão "Copiar Código PIX" funciona
- [ ] Dashboard admin carrega sem erros

### **Banco de Dados**
- [ ] Tabela `estacionamentos` tem coluna `mp_account_id`
- [ ] Tabela `pagamentos` tem coluna `comissao_plataforma`
- [ ] Tabela `pagamentos` tem coluna `valor_estacionamento`
- [ ] Valores de split estão corretos (15% / 85%)

### **Integração Mercado Pago**
- [ ] Pagamento criado no MP Sandbox
- [ ] Split configurado com `application_fee`
- [ ] Webhook recebe notificações do MP
- [ ] Status atualiza de `pending` para `approved`

---

## 🐛 Troubleshooting

### **Erro: "Estacionamento não conectado ao Mercado Pago"**
**Solução:**
1. Execute OAuth flow novamente
2. Verifique se `mp_account_id` foi salvo no banco

### **Erro: "Invalid access_token"**
**Solução:**
1. Verifique se `.env` tem `MP_ACCESS_TOKEN` correto
2. Gere novo token em: https://www.mercadopago.com.br/developers/panel/credentials

### **Webhook não recebe notificações**
**Solução:**
1. Configure webhook no painel MP: `http://<SEU_IP>/api/reservas/webhook-pagamento`
2. Use ngrok para expor localhost: `ngrok http 3000`

### **Split não aparece no dashboard**
**Solução:**
1. Verifique se `comissao_plataforma > 0` na tabela `pagamentos`
2. Confirme que `status = 'approved'`

---

## 📊 Queries Úteis

### **Verificar splits aprovados hoje:**
```sql
SELECT 
  COUNT(*) as total,
  SUM(comissao_plataforma) as receita_parknow,
  SUM(valor_estacionamento) as receita_estacionamentos
FROM pagamentos
WHERE status = 'approved'
  AND comissao_plataforma > 0
  AND DATE(created_at) = CURRENT_DATE;
```

### **Top 5 estacionamentos por receita:**
```sql
SELECT 
  e.nome,
  COUNT(p.id) as transacoes,
  SUM(p.comissao_plataforma) as receita_gerada
FROM pagamentos p
JOIN estacionamentos e ON e.id = p.id_estacionamento
WHERE p.status = 'approved'
  AND p.comissao_plataforma > 0
GROUP BY e.id, e.nome
ORDER BY receita_gerada DESC
LIMIT 5;
```

---

## 🎉 Conclusão

Após seguir este guia, você terá:
✅ Estacionamento conectado ao Mercado Pago via OAuth  
✅ Pagamentos PIX com split automático (15% ParkNow / 85% Estacionamento)  
✅ Webhooks processando notificações  
✅ Dashboard admin exibindo estatísticas de receita  
✅ Frontend exibindo breakdown do split no modal PIX  

**Marketplace 100% funcional! 🚀**
