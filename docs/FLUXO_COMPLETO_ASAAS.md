# 🚗 Fluxo Completo de Reservas e Pagamentos - ParkNow + Asaas

## 📊 Visão Geral do Sistema

O ParkNow está 100% integrado com o Asaas para processar pagamentos via PIX com split automático.

### ✅ Split de Pagamento
- **85%** vai para o estacionamento (direto na subconta Asaas)
- **15%** fica na conta principal ParkNow (comissão da plataforma)

---

## 🔄 Fluxo Completo End-to-End

### 1️⃣ **CRIAR RESERVA COM PAGAMENTO**

**Frontend → Backend:**
```http
POST /api/reservas/com-pagamento
Authorization: Bearer {token}

{
  "estacionamento_id": 1,
  "vaga_id": 5,
  "data_entrada": "2025-11-10T14:00:00",
  "data_saida": "2025-11-10T18:00:00",
  "valor": 20.00,
  "metodo_pagamento": "pix",
  "veiculo_placa": "ABC1234",
  "veiculo_modelo": "Civic"
}
```

**O que acontece:**
1. ✅ Valida usuário autenticado
2. ✅ Busca dados do estacionamento (incluindo `asaas_wallet_id`)
3. ✅ Cria reserva no banco com status `pendente_pagamento`
4. ✅ Cria/busca cliente no Asaas pelo email do usuário
5. ✅ Calcula split: 15% plataforma + 85% estacionamento
6. ✅ Cria cobrança PIX no Asaas com split configurado
7. ✅ Gera QR Code PIX
8. ✅ Salva pagamento no banco com status `pendente`
9. ✅ Retorna QR Code para o frontend

**Resposta:**
```json
{
  "success": true,
  "reserva": {
    "id": 55,
    "status": "pendente_pagamento",
    "valor_total": 20.00
  },
  "pagamento": {
    "id": 123,
    "payment_id": "pay_abc123",
    "status": "pendente"
  },
  "qr_code": "00020126580014br.gov.bcb.pix...",
  "qr_code_base64": "data:image/png;base64,...",
  "split": {
    "total": 20.00,
    "comissao_plataforma": 3.00,
    "valor_estacionamento": 17.00
  }
}
```

---

### 2️⃣ **USUÁRIO PAGA O PIX**

**O que acontece:**
1. Cliente escaneia QR Code ou copia código PIX
2. Cliente paga no banco dele
3. Asaas recebe o pagamento
4. Asaas **AUTOMATICAMENTE** faz o split:
   - R$ 17,00 vai para a subconta do estacionamento
   - R$ 3,00 fica na conta ParkNow
5. Asaas envia webhook para o ParkNow

---

### 3️⃣ **WEBHOOK DO ASAAS CONFIRMA PAGAMENTO**

**Asaas → ParkNow:**
```http
POST /api/webhooks/asaas

{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "id": "pay_abc123",
    "status": "CONFIRMED",
    "value": 20.00,
    "externalReference": "reserva_55"
  }
}
```

**O que acontece:**
1. ✅ Webhook recebe notificação do Asaas
2. ✅ Busca pagamento no banco pelo `payment_id`
3. ✅ Atualiza status do pagamento para `aprovado`
4. ✅ Atualiza status da reserva para `confirmada`
5. ✅ **OCUPA A VAGA** automaticamente:
   ```sql
   UPDATE vagas 
   SET status = 'ocupada', 
       reserva_id_ativa = 55 
   WHERE id = 5
   ```
6. ✅ Emite evento socket.io para atualizar frontend em tempo real
7. ✅ Retorna 200 para o Asaas

**Logs gerados:**
```
✅ Status do pagamento atualizado: pagamento_id=123, status_novo=aprovado
✅ Vaga ocupada após confirmação: vaga_id=5, reserva_id=55
✅ Reserva confirmada após pagamento: reserva_id=55
```

---

### 4️⃣ **USUÁRIO VISUALIZA "MINHAS RESERVAS"**

**Frontend → Backend:**
```http
GET /api/reservas/minhas
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "data": [
    {
      "id": 55,
      "estacionamento_nome": "Silcar Estacionamento",
      "vaga_numero": "A-05",
      "status": "confirmada",
      "status_pagamento": "pago",
      "valor_total": 20.00,
      "data_entrada": "2025-11-10T14:00:00",
      "data_saida": "2025-11-10T18:00:00"
    }
  ]
}
```

---

### 5️⃣ **CANCELAR RESERVA (COM ESTORNO AUTOMÁTICO)**

**Frontend → Backend:**
```http
DELETE /api/reservas/55/cancelar
Authorization: Bearer {token}
```

**O que acontece:**
1. ✅ Valida se reserva pertence ao usuário
2. ✅ Verifica se reserva pode ser cancelada
3. ✅ Busca dados do pagamento no banco
4. ✅ **Consulta status no Asaas**
5. ✅ Se pagamento foi confirmado (`CONFIRMED` ou `RECEIVED`):
   - Chama `asaas.estornarPagamento(payment_id)`
   - Asaas estorna automaticamente para a conta do cliente
   - **Split também é estornado**: R$ 17 voltam do estacionamento
6. ✅ Se pagamento ainda está pendente:
   - Chama `asaas.cancelarPagamento(payment_id)`
   - Asaas cancela a cobrança
7. ✅ Atualiza status do pagamento para `cancelado`
8. ✅ Atualiza status da reserva para `cancelada`
9. ✅ **LIBERA A VAGA** automaticamente:
   ```sql
   UPDATE vagas 
   SET status = 'livre', 
       reserva_id_ativa = NULL 
   WHERE id = 5
   ```
10. ✅ Emite evento socket.io

**Resposta:**
```json
{
  "status": "success",
  "message": "Reserva cancelada."
}
```

**Logs gerados:**
```
✅ Estorno solicitado no Asaas: payment_id=pay_abc123
✅ Pagamento cancelado no banco: pagamento_id=123
✅ Reserva cancelada: reserva_id=55
✅ Vaga liberada: vaga_id=5
```

---

### 6️⃣ **LIMPAR HISTÓRICO**

**Frontend → Backend:**
```http
DELETE /api/reservas/historico/limpar
Authorization: Bearer {token}
```

**O que acontece:**
1. ✅ Busca todas as reservas finalizadas do usuário:
   - `cancelada`, `concluida`, `expirada`, `nao_compareceu`
2. ✅ Para cada reserva, verifica se tem pagamento pendente
3. ✅ Se tem `payment_id`, consulta status no Asaas
4. ✅ **Não deleta** reservas com pagamento `PENDING` no Asaas
5. ✅ Deleta apenas reservas sem pagamentos pendentes
6. ✅ Retorna quantidade de reservas deletadas

**Resposta:**
```json
{
  "status": "success",
  "message": "5 reserva(s) removida(s) do histórico.",
  "deletedCount": 5
}
```

---

## 🗂️ Estrutura do Banco de Dados

### Tabela: `reservas`
```sql
- id
- usuario_id
- estacionamento_id
- vaga_id
- status (pendente_pagamento, confirmada, ativa, cancelada, concluida)
- status_pagamento (pendente, pago, cancelado)
- valor_total
- data_entrada_prevista
- data_saida_prevista
```

### Tabela: `pagamentos`
```sql
- id
- reserva_id
- usuario_id
- estacionamento_id
- metodo (pix)
- valor
- status (pendente, aprovado, cancelado, estornado)
```

### Tabela: `pix_payments`
```sql
- id
- pagamento_id
- payment_id (ID do Asaas)
- qr_code
- qr_code_base64
- expira_em
- comissao_plataforma
- valor_estacionamento
```

### Tabela: `vagas`
```sql
- id
- estacionamento_id
- numero
- status (livre, ocupada, reservada)
- reserva_id_ativa
```

### Tabela: `estacionamentos`
```sql
- id
- nome
- asaas_wallet_id (ID da subconta Asaas)
- asaas_connected_at
```

---

## 🔌 Endpoints da API

### Reservas
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/reservas/com-pagamento` | Criar reserva com pagamento PIX |
| GET | `/api/reservas/minhas` | Listar minhas reservas |
| GET | `/api/reservas/:id` | Ver detalhes de uma reserva |
| DELETE | `/api/reservas/:id/cancelar` | Cancelar reserva (com estorno) |
| DELETE | `/api/reservas/historico/limpar` | Limpar histórico de reservas |
| POST | `/api/reservas/:id/notificar-pagamento` | Notificar visualização do PIX |

### Webhooks
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/webhooks/asaas` | Receber notificações do Asaas |

---

## 🔐 Segurança e Validações

### Autenticação
- ✅ Todas as rotas requerem JWT válido
- ✅ Middleware `protectUser` valida token
- ✅ Usuário só acessa suas próprias reservas

### Validações de Negócio
- ✅ Não permite criar reserva duplicada no mesmo estacionamento
- ✅ Não permite cancelar reserva de outro usuário
- ✅ Não deleta reservas com pagamentos pendentes
- ✅ Verifica se estacionamento tem `asaas_wallet_id` configurado

### Transações no Banco
- ✅ Todas as operações críticas usam transações
- ✅ Rollback automático em caso de erro
- ✅ Commit apenas após sucesso completo

---

## 📊 Estados do Sistema

### Status da Reserva
| Status | Descrição |
|--------|-----------|
| `pendente_pagamento` | Aguardando pagamento do PIX |
| `confirmada` | Pagamento confirmado, vaga reservada |
| `ativa` | Cliente já chegou ao estacionamento |
| `concluida` | Reserva finalizada normalmente |
| `cancelada` | Cancelada pelo usuário ou sistema |
| `expirada` | Pagamento não foi feito no prazo |

### Status do Pagamento
| Status | Descrição |
|--------|-----------|
| `pendente` | Aguardando pagamento |
| `aprovado` | Pagamento confirmado |
| `cancelado` | Pagamento cancelado |
| `estornado` | Valor estornado ao cliente |
| `expirado` | PIX expirou sem pagamento |

### Status da Vaga
| Status | Descrição |
|--------|-----------|
| `livre` | Disponível para reserva |
| `reservada` | Reservada mas cliente ainda não chegou |
| `ocupada` | Cliente está no estacionamento |

---

## 🔔 Notificações em Tempo Real (Socket.io)

O sistema emite eventos quando:
- ✅ Vaga é liberada → `atualizacao_vaga`
- ✅ Vaga é ocupada → `atualizacao_vaga`
- ✅ Reserva é atualizada → `atualizacao_reserva`

---

## 🧪 Como Testar o Fluxo Completo

### 1. Criar Reserva
```bash
curl -X POST http://localhost:3000/api/reservas/com-pagamento \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "estacionamento_id": 1,
    "vaga_id": 5,
    "data_entrada": "2025-11-10T14:00:00",
    "data_saida": "2025-11-10T18:00:00",
    "valor": 20.00,
    "metodo_pagamento": "pix"
  }'
```

### 2. Pagar PIX no Sandbox
- Copie o QR Code da resposta
- Acesse: https://sandbox.asaas.com/
- Simule o pagamento

### 3. Verificar Webhook
```bash
# Logs do servidor mostrarão:
🔔 Webhook Asaas recebido: event=PAYMENT_CONFIRMED
✅ Status do pagamento atualizado
✅ Vaga ocupada
```

### 4. Cancelar Reserva
```bash
curl -X DELETE http://localhost:3000/api/reservas/55/cancelar \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 5. Verificar Estorno
```bash
# Logs mostrarão:
✅ Estorno solicitado no Asaas
✅ Vaga liberada
```

---

## 📝 Variáveis de Ambiente

```env
# Asaas
ASAAS_SANDBOX=true
ASAAS_SANDBOX_API_KEY=sua_chave_sandbox
ASAAS_API_KEY=sua_chave_producao
ASAAS_PLATFORM_FEE_PERCENT=15.0
ASAAS_WEBHOOK_URL=https://seudominio.com/api/webhooks/asaas
```

---

## 🎯 Checklist de Verificação

- [x] Split de 85%/15% configurado e funcionando
- [x] Cliente criado automaticamente no Asaas
- [x] QR Code PIX gerado corretamente
- [x] Webhook recebe notificações do Asaas
- [x] Pagamento confirmado atualiza reserva
- [x] Vaga ocupada automaticamente após pagamento
- [x] Cancelamento faz estorno no Asaas
- [x] Vaga liberada automaticamente após cancelamento
- [x] Histórico não deleta reservas com pagamento pendente
- [x] Logs detalhados em todas as operações
- [x] Transações garantem consistência do banco
- [x] Socket.io atualiza frontend em tempo real

---

## 🚀 Próximos Passos (Produção)

1. Mudar `ASAAS_SANDBOX=false`
2. Configurar `ASAAS_API_KEY` de produção
3. Configurar webhook URL pública
4. Testar fluxo completo em staging
5. Deploy em produção

---

## 📞 Suporte

Em caso de problemas, verificar:
1. Logs do servidor (`/logs/`)
2. Status do pagamento no painel Asaas
3. Status da reserva no banco de dados
4. Webhooks recebidos do Asaas

---

**Criado em:** 10/11/2025  
**Última atualização:** 10/11/2025  
**Versão:** 1.0
