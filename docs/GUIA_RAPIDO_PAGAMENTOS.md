# Guia Rápido - Sistema de Pagamentos ParkNow

## 📚 Documentação Completa

Para análise detalhada do sistema de pagamentos, consulte:
- **[PAYMENT_SYSTEM_ANALYSIS.md](./PAYMENT_SYSTEM_ANALYSIS.md)** - Análise completa do sistema
- **[PAYMENT_FLOW_DIAGRAM.md](./PAYMENT_FLOW_DIAGRAM.md)** - Diagramas de fluxo detalhados

---

## 🎯 Visão Geral Rápida

O sistema de pagamentos do ParkNow suporta **3 métodos principais**:

1. **PIX** 🇧🇷 - QR Code real gerado com biblioteca oficial
2. **Cartão de Crédito/Débito** 💳 - Preparado para gateway (atualmente simulado)
3. **Dinheiro** 💵 - Pagamento no local

---

## 🔄 Fluxo PIX (Mais Comum)

### 1️⃣ Cliente Cria Reserva

```http
POST /api/reservas/com-pagamento
Authorization: Bearer <JWT_TOKEN>

{
  "estacionamento_id": 1,
  "vaga_id": 5,
  "data_entrada": "2024-06-20T14:00:00-03:00",
  "data_saida": "2024-06-20T16:00:00-03:00",
  "valor": 20.0,
  "metodo_pagamento": "pix"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "reserva": { "id": 123, "status": "pendente" },
    "pagamento": { "id": 456, "status": "pendente" },
    "pix_qr_code": "data:image/png;base64,...",
    "pix_qr_code_text": "00020126580014br.gov.bcb.pix...",
    "chave_pix": "12345678000190",
    "nome_titular": "ESTACIONAMENTO XYZ LTDA",
    "valor": 20.0,
    "expira_em": "2024-06-20T14:30:00Z"
  }
}
```

### 2️⃣ Cliente Paga e Notifica

```http
POST /api/reservas/123/notificar-pix
Authorization: Bearer <JWT_TOKEN>

{
  "tipo": "pix_copiado",
  "codigoPix": "00020126580014br.gov.bcb.pix..."
}
```

### 3️⃣ Estacionamento Confirma

Email recebido com links:
- ✅ **Confirmar Pagamento**: `/api/reservas/123/confirmar-pagamento?token=XXX`
- ❌ **Cancelar Reserva**: `/api/reservas/123/cancelar-reserva?token=XXX`

### 4️⃣ Status Final

```http
GET /api/pagamentos/456/status
Authorization: Bearer <JWT_TOKEN>
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": 456,
    "status": "aprovado",
    "valor": 20.0,
    "data_pagamento": "2024-06-20T14:05:00Z"
  }
}
```

---

## 📊 Status de Pagamento

| Status | Descrição | Próxima Ação |
|--------|-----------|--------------|
| `pendente` | Aguardando confirmação | Cliente deve pagar e notificar |
| `aprovado` | Confirmado pelo estacionamento | Reserva ativa |
| `recusado` | Recusado pelo gateway | Tentar outro método |
| `cancelado` | Cancelado (manual ou timeout) | Criar nova reserva |
| `reembolsado` | Estornado ao cliente | Nenhuma |

---

## 🏗️ Arquitetura Simplificada

```
Cliente → API → Services → Models → Database
          ↓
    Notificações (Email + Socket.IO)
```

### Componentes Principais:

**Controllers:**
- `reservaPagamentoController` - Criar reserva com pagamento
- `paymentController` - Processar e verificar pagamentos
- `pixPaymentController` - Confirmar PIX manualmente

**Services:**
- `reservaService` - Orquestrar criação de reserva
- `estacionamentoPaymentProcessingService` - Processar pagamentos
- `notificationService` - Enviar notificações

**Models:**
- `pagamentoModel` - CRUD de pagamentos
- `reservaModel` - CRUD de reservas
- `estacionamentoModel` - Config de estacionamentos

---

## 🔐 Segurança

### ✅ Implementado

- **Ocultação de Dados Sensíveis**: Logs não mostram dados completos de cartão
- **Transações ACID**: Rollback automático em caso de erro
- **Validação de Tokens**: Links de confirmação expiram em 30 minutos
- **Rate Limiting**: Proteção contra força bruta
- **Logs de Auditoria**: Winston + triggers de banco

### Exemplo de Ocultação:

```javascript
// Entrada
{
  numero_cartao: "1234567890123456",
  cvv: "123",
  chave_pix: "12345678000190"
}

// Log
{
  numero_cartao: "**** **** **** 3456",
  cvv: "***",
  chave_pix: "1234...0190"
}
```

---

## ⏰ Expiração Automática

**Cron Job** executa a cada 5 minutos:

1. Busca pagamentos com status `aguardando_confirmacao`
2. Verifica se passaram mais de 30 minutos
3. Cancela reserva automaticamente
4. Libera a vaga
5. Notifica o cliente por email + Socket.IO

**Código:**
```javascript
// controllers/pixPaymentController.js
exports.verificarReservasExpiradas = async (req, res) => {
  const trintaMinutosAtras = new Date(Date.now() - 30 * 60 * 1000);
  
  const reservasExpiradas = await db.Reserva.findAll({
    where: {
      status_pagamento: 'aguardando_confirmacao',
      data_notificacao_pix: { [Op.lte]: trintaMinutosAtras }
    }
  });

  for (const reserva of reservasExpiradas) {
    await reserva.update({ status: 'cancelada', status_pagamento: 'expirado' });
    await db.Vaga.update({ status: 'disponivel' }, { where: { id: reserva.vaga_id } });
    await emailService.enviarEmailCancelamento(...);
  }
};
```

---

## 🗄️ Banco de Dados

### Tabelas Principais:

**pagamentos**
```sql
id               SERIAL PRIMARY KEY
reserva_id       INTEGER (FK → reservas.id)
metodo_pagamento VARCHAR(20)  -- 'pix', 'cartao_credito', etc.
valor            DECIMAL(10,2)
status           VARCHAR(20)  -- 'pendente', 'aprovado', etc.
dados_retorno    JSONB        -- QR Code, txid, etc.
created_at       TIMESTAMP
updated_at       TIMESTAMP
```

**estacionamento_pagamentos**
```sql
id                  SERIAL PRIMARY KEY
estacionamento_id   INTEGER (FK → estacionamentos.id)
tipo_chave_pix      VARCHAR(20)  -- 'CPF', 'CNPJ', 'EMAIL', etc.
chave_pix           VARCHAR(140)
nome_titular        VARCHAR(255)
banco               VARCHAR(100)
tipo_conta          VARCHAR(20)
agencia             VARCHAR(20)
conta               VARCHAR(50)
```

**reservas**
```sql
id                    SERIAL PRIMARY KEY
id_pagamento          INTEGER (FK → pagamentos.id)
status                VARCHAR(20)  -- 'pendente', 'confirmada', etc.
status_pagamento      VARCHAR(20)  -- 'pendente', 'pago', etc.
data_entrada_prevista TIMESTAMP
data_saida_prevista   TIMESTAMP
valor_total           DECIMAL(10,2)
```

---

## 🔧 Configuração de Estacionamento

### Cadastrar Chave PIX

```http
POST /api/estacionamentos/1/configuracao-pagamento
Authorization: Bearer <ADMIN_JWT_TOKEN>

{
  "tipo_chave_pix": "CNPJ",
  "chave_pix": "12345678000190",
  "nome_titular": "Estacionamento XYZ LTDA",
  "banco": "Banco do Brasil",
  "tipo_conta": "CONTA_CORRENTE",
  "agencia": "1234",
  "conta": "567890"
}
```

### Validações Automáticas:

✅ Formato da chave PIX (CPF, CNPJ, Email, Telefone)  
✅ CNPJ da chave corresponde ao CNPJ do estacionamento  
✅ Nome do titular não está vazio  

---

## 📡 Webhooks (Futuro)

### Configuração:

```env
# .env
PIX_WEBHOOK_SECRET=your_secret_key_here
WEBHOOK_URL=https://seu-dominio.com/api/payments/webhook/pix
```

### Processamento:

```http
POST /api/payments/webhook/pix
X-Signature: sha256=abc123def456...

{
  "pix": [{
    "txid": "PARKNOW1234567890",
    "valor": 20.0,
    "horario": "2024-06-20T14:05:00Z",
    "pagador": {
      "nome": "João Silva",
      "cpf": "12345678901"
    }
  }]
}
```

**O que acontece:**
1. Valida assinatura HMAC
2. Busca pagamento pelo `txid`
3. Atualiza status para `aprovado`
4. Confirma reserva
5. Notifica cliente

---

## 🧪 Testes

### Executar Testes:

```bash
npm test                  # Todos os testes
npm run test:watch        # Modo watch
npm run test:coverage     # Com cobertura
```

### Criar Dados de Teste:

```bash
node scripts/seed-payment-data.js
```

Isso cria:
- 1 usuário de teste (email: teste@parknow.com.br, senha: senha123)
- 1 estacionamento com configuração PIX
- 10 vagas de teste

---

## 📝 Logs

### Estrutura de Logs (Winston):

```javascript
// Log de criação de pagamento
{
  level: 'info',
  message: 'Pagamento criado com sucesso',
  timestamp: '2024-06-20T14:00:00Z',
  pagamento_id: 456,
  reserva_id: 123,
  metodo: 'pix',
  valor: 20.0
}

// Log de erro
{
  level: 'error',
  message: 'Erro ao processar pagamento',
  timestamp: '2024-06-20T14:00:00Z',
  error: 'Estacionamento não configurado para PIX',
  stack: '...',
  dados_pagamento: '*** DADOS OCULTOS ***'
}
```

### Localização dos Logs:

```
logs/
  ├── combined.log  (todos os logs)
  ├── error.log     (apenas erros)
  └── exceptions.log (exceções não tratadas)
```

---

## 🚀 Melhorias Futuras

### Curto Prazo:

1. **Webhook Automático PIX**
   - Eliminar confirmação manual
   - Integração com API do Banco Central

2. **Gateway de Pagamento Real**
   - Stripe (internacional)
   - Pagar.me ou PagSeguro (Brasil)

3. **Parcelamento**
   - Suporte a múltiplas parcelas
   - Cálculo de juros

### Médio Prazo:

1. **Boleto Bancário**
   - Geração de boletos
   - Integração com bancos

2. **Carteira Digital**
   - Google Pay
   - Apple Pay
   - Samsung Pay

3. **Relatórios Financeiros**
   - Dashboard de receitas
   - Exportação de extratos

### Longo Prazo:

1. **Machine Learning**
   - Detecção de fraudes
   - Previsão de inadimplência

2. **Blockchain**
   - Pagamentos em criptomoedas
   - Smart contracts

---

## ❓ FAQ

### Como funciona a geração do QR Code PIX?

O sistema usa a biblioteca `pix-payload` que gera payloads conforme o padrão **BR Code** do Banco Central:

```javascript
const pixPayloadString = generatePixPayload({
  key: chavePix,              // Chave PIX do estacionamento
  name: nomeTitular,          // Nome (máx 25 caracteres)
  city: cidade,               // Cidade (máx 15 caracteres)
  amount: valor,              // Valor da transação
  transactionId: txid         // ID único
});

const qrCodeBase64 = await QRCode.toDataURL(pixPayloadString);
```

### Por que a confirmação é manual?

Atualmente, para evitar custos de integração bancária, o sistema usa confirmação manual por email. Isso permite que o estacionamento verifique o recebimento e confirme manualmente.

**Futuramente**, será implementado webhook automático para confirmação instantânea.

### O que acontece se o cliente não pagar?

Após **30 minutos** sem confirmação:
1. Cron job cancela a reserva automaticamente
2. Vaga é liberada
3. Cliente recebe email de cancelamento
4. Notificação em tempo real (Socket.IO)

### Como adicionar um novo método de pagamento?

1. Adicione o método em `config/constants.js`:
   ```javascript
   const PAYMENT_METHODS = {
     PIX: 'pix',
     CARTAO_CREDITO: 'cartao_credito',
     NOVO_METODO: 'novo_metodo'  // Adicione aqui
   };
   ```

2. Implemente o processador em `estacionamentoPaymentProcessingService.js`:
   ```javascript
   async processarPagamentoNovoMetodo(reserva, estacionamento, valorTotal, dadosPagamento, client) {
     // Sua lógica aqui
   }
   ```

3. Adicione o case no switch:
   ```javascript
   switch (metodoPagamento) {
     case PAYMENT_METHODS.NOVO_METODO:
       resultadoPagamento = await this.processarPagamentoNovoMetodo(...);
       break;
   }
   ```

### Como testar pagamentos em desenvolvimento?

1. **Usar dados de teste**:
   ```bash
   node scripts/seed-payment-data.js
   ```

2. **Simular PIX**:
   - Crie uma reserva com método PIX
   - Copie o link de confirmação do email (check logs ou DB)
   - Acesse o link manualmente

3. **Usar Postman/Insomnia**:
   - Importe a collection da API
   - Execute os endpoints em sequência

---

## 📞 Suporte

Para dúvidas ou problemas:

1. **Consulte a documentação completa**:
   - [PAYMENT_SYSTEM_ANALYSIS.md](./PAYMENT_SYSTEM_ANALYSIS.md)
   - [PAYMENT_FLOW_DIAGRAM.md](./PAYMENT_FLOW_DIAGRAM.md)

2. **Verifique os logs**:
   ```bash
   tail -f logs/combined.log
   ```

3. **Abra uma issue** no GitHub com:
   - Descrição do problema
   - Logs relevantes (sem dados sensíveis)
   - Steps para reproduzir

---

**Última Atualização:** 2024-11-07  
**Versão:** 1.0.0  
**Equipe:** ParkNow Development Team
