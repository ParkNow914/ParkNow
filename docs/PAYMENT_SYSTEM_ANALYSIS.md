# Análise Completa do Sistema de Pagamento de Reservas - ParkNow

## Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
4. [Métodos de Pagamento Suportados](#métodos-de-pagamento-suportados)
5. [Fluxo de Pagamento PIX](#fluxo-de-pagamento-pix)
6. [Fluxo de Pagamento com Cartão](#fluxo-de-pagamento-com-cartão)
7. [Fluxo de Pagamento em Dinheiro](#fluxo-de-pagamento-em-dinheiro)
8. [Status de Pagamento](#status-de-pagamento)
9. [Webhooks e Notificações](#webhooks-e-notificações)
10. [Segurança](#segurança)
11. [API Endpoints](#api-endpoints)
12. [Diagrama de Fluxo](#diagrama-de-fluxo)

---

## Visão Geral

O sistema ParkNow implementa um **sistema completo de pagamento** para reservas de estacionamento com suporte a múltiplos métodos de pagamento. O sistema foi projetado para ser **seguro**, **escalável** e **fácil de usar**.

### Características Principais:
- ✅ Pagamento via **PIX** com QR Code real
- ✅ Pagamento via **Cartão de Crédito/Débito**
- ✅ Pagamento em **Dinheiro** (no local)
- ✅ Confirmação manual de pagamentos PIX
- ✅ Notificações em tempo real via Socket.IO
- ✅ Webhooks para integração com gateways de pagamento
- ✅ Logs completos de auditoria
- ✅ Validação de chave PIX
- ✅ Expiração automática de pagamentos pendentes

---

## Arquitetura do Sistema

### Componentes Principais

```
┌─────────────────┐
│   Cliente       │
│  (Frontend)     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         API REST (Express.js)           │
├─────────────────────────────────────────┤
│  Controllers:                           │
│  - reservaPagamentoController           │
│  - paymentController                    │
│  - pixPaymentController                 │
│  - webhookController                    │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│           Services Layer                │
├─────────────────────────────────────────┤
│  - reservaService                       │
│  - estacionamentoPaymentProcessingService│
│  - notificationService                  │
│  - emailService                         │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│           Models Layer                  │
├─────────────────────────────────────────┤
│  - pagamentoModel                       │
│  - reservaModel                         │
│  - estacionamentoModel                  │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│      PostgreSQL Database                │
│  - Tabela: pagamentos                   │
│  - Tabela: reservas                     │
│  - Tabela: estacionamento_pagamentos    │
└─────────────────────────────────────────┘
```

### Bibliotecas Utilizadas

- **pix-payload**: Geração de payloads PIX conforme padrão BR Code
- **qrcode**: Geração de QR Codes para PIX
- **socket.io**: Notificações em tempo real
- **nodemailer**: Envio de emails de confirmação
- **express-validator**: Validação de dados de entrada
- **winston**: Logging estruturado

---

## Estrutura do Banco de Dados

### Tabela: `pagamentos`

Armazena todos os pagamentos realizados no sistema.

```sql
CREATE TABLE pagamentos (
    id SERIAL PRIMARY KEY,
    reserva_id INTEGER NOT NULL,
    metodo_pagamento VARCHAR(20) NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    dados_retorno JSONB,
    id_estacionamento INTEGER,
    id_usuario INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_reserva FOREIGN KEY (reserva_id) 
        REFERENCES reservas(id) ON DELETE CASCADE,
    
    CONSTRAINT check_metodo_valido CHECK (
        metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'dinheiro')
    ),
    
    CONSTRAINT check_status_valido CHECK (
        status IN ('pendente', 'aprovado', 'recusado', 'cancelado', 'reembolsado')
    ),
    
    CONSTRAINT check_valor_positivo CHECK (valor > 0)
);
```

#### Campos Principais:
- `id`: Identificador único do pagamento
- `reserva_id`: ID da reserva associada
- `metodo_pagamento`: Método utilizado (pix, cartao_credito, cartao_debito, dinheiro)
- `valor`: Valor do pagamento em decimal
- `status`: Estado atual do pagamento
- `dados_retorno`: Dados adicionais em formato JSON (QR Code, transação ID, etc.)
- `id_estacionamento`: ID do estacionamento que receberá o pagamento
- `id_usuario`: ID do usuário que realizou o pagamento

### Tabela: `estacionamento_pagamentos`

Armazena as configurações de pagamento de cada estacionamento.

```sql
CREATE TABLE estacionamento_pagamentos (
    id SERIAL PRIMARY KEY,
    estacionamento_id INTEGER NOT NULL,
    tipo_chave_pix VARCHAR(20) NOT NULL,
    chave_pix VARCHAR(140) NOT NULL,
    nome_titular VARCHAR(255) NOT NULL,
    banco VARCHAR(100),
    tipo_conta VARCHAR(20) DEFAULT 'CONTA_CORRENTE',
    agencia VARCHAR(20),
    conta VARCHAR(50),
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_estacionamento FOREIGN KEY (estacionamento_id) 
        REFERENCES estacionamentos(id) ON DELETE CASCADE,
    
    CONSTRAINT uk_estacionamento_pagamento UNIQUE (estacionamento_id),
    
    CONSTRAINT ck_tipo_chave_pix_valido CHECK (
        tipo_chave_pix IN ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA')
    )
);
```

### Tabela: `reservas`

Relacionada com pagamentos através de `reserva_id`.

Campos relevantes para pagamento:
- `id_pagamento`: ID do pagamento associado
- `status_pagamento`: Status do pagamento ('pendente', 'pago', 'cancelado')
- `valor_total`: Valor total da reserva
- `status`: Status da reserva ('pendente', 'confirmada', 'cancelada', 'ativa', 'concluida')

---

## Métodos de Pagamento Suportados

### 1. PIX 🇧🇷

**Características:**
- Gera QR Code real usando biblioteca `pix-payload`
- QR Code em formato base64 (data URI)
- Código PIX copia e cola (payload EMV)
- Expiração automática em 30 minutos
- Confirmação manual pelo estacionamento

**Fluxo:**
1. Cliente cria reserva e escolhe PIX como método
2. Sistema gera QR Code real com chave PIX do estacionamento
3. Cliente escaneia QR Code ou copia código PIX
4. Cliente realiza pagamento no app do banco
5. Cliente clica em "Paguei" no sistema
6. Estacionamento recebe notificação por email
7. Estacionamento confirma recebimento (link no email)
8. Reserva é confirmada automaticamente

### 2. Cartão de Crédito/Débito 💳

**Características:**
- Validação de dados do cartão
- Identificação automática da bandeira
- Suporte a parcelamento
- Integração preparada para gateways (Stripe, Pagar.me, etc.)

**Nota:** Atualmente implementado de forma simulada. Em produção, requer integração com gateway de pagamento real.

### 3. Dinheiro 💵

**Características:**
- Pagamento no local do estacionamento
- Calcula troco automaticamente
- Notifica estacionamento sobre reserva
- Status pendente até confirmação presencial

---

## Fluxo de Pagamento PIX

### Passo 1: Criação da Reserva com Pagamento

**Endpoint:** `POST /api/reservas/com-pagamento`

```javascript
// Request
{
  "estacionamento_id": 1,
  "vaga_id": 5,
  "data_entrada": "2024-06-20T14:00:00-03:00",
  "data_saida": "2024-06-20T16:00:00-03:00",
  "valor": 20.0,
  "veiculo_placa": "ABC1D23",
  "metodo_pagamento": "pix"
}

// Response
{
  "success": true,
  "data": {
    "reserva": {
      "id": 123,
      "status": "pendente",
      "status_pagamento": "pendente"
    },
    "pagamento": {
      "id": 456,
      "status": "pendente"
    },
    "pix_qr_code": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "pix_qr_code_text": "00020126580014br.gov.bcb.pix...",
    "chave_pix": "12345678000190",
    "nome_titular": "ESTACIONAMENTO XYZ LTDA",
    "valor": 20.0,
    "expira_em": "2024-06-20T14:30:00Z"
  }
}
```

### Passo 2: Geração do QR Code PIX

**Arquivo:** `services/estacionamentoPaymentProcessingService.js`

```javascript
async gerarQrCodePix({ chavePix, nomeTitular, valor, descricao, cidade, txid }) {
    // Normaliza nome e cidade (remove acentos, limita caracteres)
    const nomeTitularNormalizado = nomeTitular
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .substring(0, 25);

    const cidadeNormalizada = (cidade || 'SAO PAULO')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .substring(0, 15);

    // Cria payload PIX real seguindo padrão BR Code
    const pixPayloadString = generatePixPayload({
        key: chavePix,
        name: nomeTitularNormalizado,
        city: cidadeNormalizada,
        amount: valor,
        transactionId: txid
    });

    // Gera QR Code em base64
    const qrCodeBase64 = await QRCode.toDataURL(pixPayloadString, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300
    });

    return {
        qr_code: qrCodeBase64,
        qr_code_text: pixPayloadString,
        chave_pix: chavePix,
        nome_titular: nomeTitularNormalizado,
        valor: valor,
        txid: txid,
        expira_em: new Date(Date.now() + (30 * 60 * 1000))
    };
}
```

### Passo 3: Cliente Notifica que Pagou

**Endpoint:** `POST /api/reservas/:reservaId/notificar-pix`

```javascript
// Request
{
  "tipo": "pix_copiado",
  "codigoPix": "00020126580014br.gov.bcb.pix..."
}

// O que acontece:
1. Atualiza status da reserva para "aguardando_confirmacao"
2. Gera tokens de confirmação/cancelamento
3. Envia email para estacionamento com links de ação
4. Cria notificação no sistema
5. Emite evento Socket.IO em tempo real
```

### Passo 4: Estacionamento Confirma Pagamento

**Endpoint:** `GET /api/reservas/:reservaId/confirmar-pagamento?token=XXX`

```javascript
// O que acontece:
1. Valida token de confirmação (expira em 30 minutos)
2. Atualiza status do pagamento para "pago"
3. Confirma a reserva
4. Envia email de confirmação ao cliente
5. Cria notificação para o usuário
6. Redireciona para dashboard do admin
```

### Passo 5: Expiração Automática (Opcional)

**Arquivo:** `controllers/pixPaymentController.js`

```javascript
// Cron job verifica pagamentos expirados a cada 5 minutos
// Cancela reservas com pagamento pendente há mais de 30 minutos

async verificarReservasExpiradas() {
    const trintaMinutosAtras = new Date(Date.now() - 30 * 60 * 1000);
    
    // Busca reservas expiradas
    const reservasExpiradas = await db.Reserva.findAll({
        where: {
            status_pagamento: 'aguardando_confirmacao',
            data_notificacao_pix: { [Op.lte]: trintaMinutosAtras },
            status: { [Op.ne]: 'cancelada' }
        }
    });

    // Cancela cada reserva expirada
    for (const reserva of reservasExpiradas) {
        await reserva.update({
            status: 'cancelada',
            status_pagamento: 'expirado',
            motivo_cancelamento: 'Pagamento não confirmado dentro do prazo'
        });
        
        // Libera a vaga
        await db.Vaga.update({ status: 'disponivel' }, 
            { where: { id: reserva.vaga_id } });
        
        // Notifica o cliente
        await emailService.enviarEmailCancelamento(...);
    }
}
```

---

## Fluxo de Pagamento com Cartão

**Arquivo:** `services/estacionamentoPaymentProcessingService.js`

### Validação de Dados

```javascript
validarDadosCartao(dados) {
    // Valida número do cartão (13-19 dígitos)
    if (!dados.numero_cartao || !/^\d{13,19}$/.test(dados.numero_cartao)) {
        throw new AppError('Número do cartão inválido', 400);
    }

    // Valida nome do titular (mínimo 3 caracteres)
    if (!dados.nome_titular || dados.nome_titular.trim().length < 3) {
        throw new AppError('Nome do titular inválido', 400);
    }

    // Valida validade (formato MM/AA)
    if (!dados.validade || !/^(0[1-9]|1[0-2])\/([0-9]{2})$/.test(dados.validade)) {
        throw new AppError('Data de validade inválida', 400);
    }

    // Valida CVV (3-4 dígitos)
    if (!dados.cvv || !/^\d{3,4}$/.test(dados.cvv)) {
        throw new AppError('CVV inválido', 400);
    }

    // Verifica se não está expirado
    const [mes, ano] = dados.validade.split('/').map(Number);
    const dataAtual = new Date();
    const anoAtual = dataAtual.getFullYear() % 100;
    const mesAtual = dataAtual.getMonth() + 1;

    if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) {
        throw new AppError('Cartão expirado', 400);
    }
}
```

### Identificação de Bandeira

```javascript
identificarBandeira(numeroCartao) {
    const num = numeroCartao.replace(/\D/g, '');

    if (/^4/.test(num)) return 'visa';
    if (/^5[1-5]/.test(num)) return 'mastercard';
    if (/^3[47]/.test(num)) return 'amex';
    if (/^(6011|65|64[4-9]|622)/.test(num)) return 'discover';
    if (/^(637|638|639)/.test(num)) return 'elo';
    if (/^(606282|3841[046]*)/.test(num)) return 'hipercard';

    return 'outros';
}
```

### Processamento

```javascript
async processarPagamentoCartao(reserva, estacionamento, valorTotal, 
                                metodoPagamento, dadosPagamento, client) {
    // Valida dados do cartão
    this.validarDadosCartao(dadosPagamento);

    // Em produção, aqui seria feita a integração com gateway
    // Exemplo: Stripe, Pagar.me, PagSeguro, etc.
    
    const transacaoId = `CARD_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Cria registro de pagamento
    const pagamentoId = await pagamentoModel.criarPagamento({
        reserva_id: reserva.id,
        metodo: metodoPagamento,
        valor: valorTotal,
        status: PAYMENT_STATUS.APROVADO,
        dados_adicionais: {
            transacao_id: transacaoId,
            ultimos_quatro: dadosPagamento.numero_cartao.slice(-4),
            bandeira: this.identificarBandeira(dadosPagamento.numero_cartao),
            parcelas: dadosPagamento.parcelas || 1
        }
    }, client);

    // Atualiza status da reserva
    await reservaModel.atualizarStatus(reserva.id, 'confirmada', client);

    // Envia notificação
    await notificationService.enviarNotificacao(...);

    return {
        status: PAYMENT_STATUS.APROVADO,
        metodo_pagamento: metodoPagamento,
        pagamento_id: pagamentoId,
        transacao_id: transacaoId,
        valor: valorTotal
    };
}
```

---

## Fluxo de Pagamento em Dinheiro

**Arquivo:** `services/estacionamentoPaymentProcessingService.js`

```javascript
async processarPagamentoDinheiro(reserva, estacionamento, valorTotal, 
                                  dadosPagamento, client) {
    // Cria registro de pagamento pendente
    const pagamentoId = await pagamentoModel.criarPagamento({
        reserva_id: reserva.id,
        metodo: PAYMENT_METHODS.DINHEIRO,
        valor: valorTotal,
        status: PAYMENT_STATUS.PENDENTE,
        dados_adicionais: {
            tipo: 'dinheiro',
            valor_troco: dadosPagamento.valor_entregue 
                ? (dadosPagamento.valor_entregue - valorTotal) 
                : null,
            valor_entregue: dadosPagamento.valor_entregue || valorTotal,
            observacao: dadosPagamento.observacao
        }
    }, client);

    // Confirma a reserva (pagamento será feito no local)
    await reservaModel.atualizarStatus(reserva.id, 'confirmada', client);

    // Notifica o usuário
    await notificationService.enviarNotificacao(
        reserva.usuario_id,
        {
            tipo: 'pagamento_dinheiro',
            titulo: 'Pagamento em Dinheiro',
            mensagem: `Seu pagamento de ${formatCurrency(valorTotal)} 
                       será realizado no local.`,
            dados: {
                valor_entregue: dadosPagamento.valor_entregue || valorTotal,
                troco: dadosPagamento.valor_entregue 
                    ? (dadosPagamento.valor_entregue - valorTotal) 
                    : 0
            }
        }
    );

    // Notifica o estacionamento
    await notificationService.enviarNotificacao(
        estacionamento.usuario_id,
        {
            tipo: 'pagamento_dinheiro_estacionamento',
            titulo: 'Pagamento em Dinheiro - Nova Reserva',
            mensagem: `Nova reserva #${reserva.id} com pagamento em dinheiro 
                       no valor de ${formatCurrency(valorTotal)}.`
        }
    );

    return {
        status: PAYMENT_STATUS.PENDENTE,
        metodo_pagamento: PAYMENT_METHODS.DINHEIRO,
        pagamento_id: pagamentoId,
        valor: valorTotal,
        mensagem: 'Pagamento em dinheiro registrado. 
                   Apresente o comprovante no local.'
    };
}
```

---

## Status de Pagamento

### Ciclo de Vida de um Pagamento

```
┌──────────┐
│ PENDENTE │ ◄─── Pagamento criado
└────┬─────┘
     │
     ├─────────► ┌──────────┐
     │           │ APROVADO │ ◄─── Pagamento confirmado
     │           └──────────┘
     │
     ├─────────► ┌──────────┐
     │           │ RECUSADO │ ◄─── Pagamento rejeitado
     │           └──────────┘
     │
     ├─────────► ┌───────────┐
     │           │ CANCELADO │ ◄─── Pagamento cancelado
     │           └───────────┘
     │
     └─────────► ┌──────────────┐
                 │ REEMBOLSADO  │ ◄─── Pagamento estornado
                 └──────────────┘
```

### Status Disponíveis

1. **PENDENTE**: Pagamento criado, aguardando confirmação
2. **APROVADO**: Pagamento confirmado e processado com sucesso
3. **RECUSADO**: Pagamento recusado pelo gateway/banco
4. **CANCELADO**: Pagamento cancelado pelo usuário ou sistema
5. **REEMBOLSADO**: Pagamento foi estornado ao usuário

### Constantes no Sistema

**Arquivo:** `config/constants.js`

```javascript
const PAYMENT_STATUS = {
    PENDENTE: 'pendente',
    APROVADO: 'aprovado',
    RECUSADO: 'recusado',
    CANCELADO: 'cancelado',
    REEMBOLSADO: 'reembolsado'
};

const PAYMENT_METHODS = {
    PIX: 'pix',
    CARTAO_CREDITO: 'cartao_credito',
    CARTAO_DEBITO: 'cartao_debito',
    DINHEIRO: 'dinheiro'
};
```

---

## Webhooks e Notificações

### Webhook de Pagamento

**Endpoint:** `POST /api/payments/webhook/:provedor`

**Arquivo:** `controllers/paymentController.js`

```javascript
async webhookPagamento(req, res, next) {
    const { provedor } = req.params;
    const payload = req.body;
    const signature = req.headers['x-signature'];
    
    try {
        // Valida assinatura do webhook
        const valido = await this.validarAssinaturaWebhook(
            provedor, 
            payload, 
            signature
        );
        
        if (!valido) {
            throw new BadRequestError('Assinatura inválida');
        }
        
        // Processa webhook de acordo com o provedor
        let resultado;
        
        switch (provedor.toLowerCase()) {
            case 'pix':
                resultado = await this.processarWebhookPix(payload);
                break;
                
            case 'stripe':
            case 'pagarme':
            case 'pagseguro':
                // Implementar outros provedores
                resultado = { processado: false };
                break;
                
            default:
                throw new BadRequestError(`Provedor não suportado: ${provedor}`);
        }
        
        res.json({ success: true, data: resultado });
        
    } catch (error) {
        logger.error('Erro ao processar webhook:', error);
        
        // Responde com sucesso para evitar tentativas repetidas
        res.status(200).json({
            success: false,
            error: error.message
        });
    }
}
```

### Validação de Assinatura

```javascript
async validarAssinaturaWebhook(provedor, payload, signature) {
    if (provedor.toLowerCase() === 'pix') {
        const chaveSecreta = process.env.PIX_WEBHOOK_SECRET;
        
        if (!chaveSecreta) {
            logger.warn('Chave secreta do webhook PIX não configurada');
            return false;
        }
        
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', chaveSecreta);
        const payloadString = JSON.stringify(payload);
        const assinaturaCalculada = `sha256=${hmac.update(payloadString).digest('hex')}`;
        
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(assinaturaCalculada)
        );
    }
    
    return true; // Implementar validação para outros provedores
}
```

### Notificações em Tempo Real

**Socket.IO Events:**

```javascript
// Evento: Pagamento pendente
socket.emit('pagamento_pendente', {
    reservaId: 123,
    tipo: 'pix_copiado',
    mensagem: 'Cliente copiou o código PIX',
    data: '2024-06-20T14:00:00Z'
});

// Evento: Pagamento confirmado
socket.emit('pagamento_confirmado', {
    reservaId: 123,
    pagamentoId: 456,
    valor: 20.0,
    mensagem: 'Pagamento confirmado com sucesso'
});

// Evento: Reserva expirada
socket.emit('reserva_expirada', {
    reservaId: 123,
    mensagem: 'Reserva cancelada por falta de confirmação de pagamento'
});
```

---

## Segurança

### 1. Ocultação de Dados Sensíveis

**Arquivo:** `services/estacionamentoPaymentProcessingService.js`

```javascript
ocultarDadosSensiveis(dados) {
    const ocultar = {
        numero_cartao: (num) => num ? `**** **** **** ${num.slice(-4)}` : undefined,
        cvv: () => '***',
        senha: () => '******',
        token: (t) => t ? `${t.substring(0, 4)}...${t.substring(t.length - 4)}` : undefined,
        chave_pix: (c) => c ? `${c.substring(0, 4)}...${c.substring(c.length - 4)}` : undefined
    };

    return Object.entries(dados).reduce((acc, [chave, valor]) => {
        if (ocultar[chave]) {
            acc[chave] = ocultar[chave](valor);
        } else {
            acc[chave] = valor;
        }
        return acc;
    }, {});
}
```

### 2. Validação de Chave PIX

**Middleware:** `middleware/validatePixKey.js`

- Valida formato de CPF, CNPJ, Email, Telefone
- Verifica se o CNPJ do estacionamento corresponde à chave PIX
- Impede uso de chaves PIX inválidas

### 3. Transações de Banco de Dados

Todos os pagamentos usam **transações ACID**:

```javascript
async processarPagamento(reservaId, metodoPagamento, dadosPagamento, client = db) {
    let connection;

    try {
        // Inicia transação
        if (!client) {
            connection = await db.transaction();
            client = connection;
        }

        // Operações no banco de dados
        // ...

        // Confirma transação
        if (connection) {
            await connection.commit();
        }

    } catch (error) {
        // Desfaz alterações em caso de erro
        if (connection) {
            await connection.rollback();
        }
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
```

### 4. Rate Limiting

Proteção contra ataques de força bruta e DDoS:

```javascript
// Arquivo: middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // 10 requisições por IP
    message: 'Muitas tentativas de pagamento. Tente novamente mais tarde.'
});
```

### 5. Logging e Auditoria

**Winston Logger:**

```javascript
logger.info('Pagamento criado com sucesso', {
    pagamento_id: pagamentoId,
    reserva_id: reservaId,
    metodo: metodoPagamento,
    valor: valorTotal,
    usuario_id: usuarioId
});

logger.error('Erro ao processar pagamento', {
    error: error.message,
    stack: error.stack,
    reserva_id: reservaId,
    dados_pagamento: this.ocultarDadosSensiveis(dadosPagamento)
});
```

**Triggers de Banco de Dados:**

```sql
-- Log automático de alterações em pagamentos
CREATE TRIGGER trigger_log_alteracao_pagamento
AFTER INSERT OR UPDATE OR DELETE ON pagamentos
FOR EACH ROW
EXECUTE FUNCTION log_alteracao_pagamento();
```

---

## API Endpoints

### Criar Reserva com Pagamento

**POST** `/api/reservas/com-pagamento`

**Autenticação:** Bearer Token (JWT)

**Request Body:**
```json
{
  "estacionamento_id": 1,
  "vaga_id": 5,
  "data_entrada": "2024-06-20T14:00:00-03:00",
  "data_saida": "2024-06-20T16:00:00-03:00",
  "valor": 20.0,
  "veiculo_placa": "ABC1D23",
  "veiculo_modelo": "Fiat Uno",
  "observacoes": "Vaga próxima à entrada",
  "metodo_pagamento": "pix"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reserva": {
      "id": 123,
      "status": "pendente",
      "status_pagamento": "pendente"
    },
    "pagamento": {
      "id": 456,
      "status": "pendente"
    },
    "pix_qr_code": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "pix_qr_code_text": "00020126580014br.gov.bcb.pix...",
    "chave_pix": "12345678000190",
    "nome_titular": "ESTACIONAMENTO XYZ LTDA",
    "valor": 20.0,
    "expira_em": "2024-06-20T14:30:00Z"
  },
  "message": "Reserva criada com sucesso. Realize o pagamento para confirmar."
}
```

### Verificar Status de Pagamento

**GET** `/api/pagamentos/:id/status`

**Autenticação:** Bearer Token (JWT)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 456,
    "status": "pendente",
    "valor": 20.0,
    "metodo": "pix",
    "reserva_id": 123,
    "reserva_status": "pendente",
    "created_at": "2024-06-20T14:00:00Z",
    "updated_at": "2024-06-20T14:00:00Z",
    "pix_qr_code": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "pix_qr_code_text": "00020126580014br.gov.bcb.pix...",
    "chave_pix": "12345678000190",
    "expira_em": "2024-06-20T14:30:00Z"
  }
}
```

### Notificar Pagamento PIX

**POST** `/api/reservas/:reservaId/notificar-pix`

**Autenticação:** Bearer Token (JWT)

**Request Body:**
```json
{
  "tipo": "pix_copiado",
  "codigoPix": "00020126580014br.gov.bcb.pix..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notificação de pagamento PIX enviada com sucesso",
  "data": {
    "reserva_id": 123,
    "status": "aguardando_confirmacao"
  }
}
```

### Confirmar Pagamento PIX (Estacionamento)

**GET** `/api/reservas/:reservaId/confirmar-pagamento?token=XXX`

**Autenticação:** Token na URL (link do email)

**Response:** Redireciona para dashboard do admin com mensagem de sucesso

### Cancelar Reserva por Falta de Pagamento

**GET** `/api/reservas/:reservaId/cancelar-reserva?token=XXX`

**Autenticação:** Token na URL (link do email)

**Response:** Redireciona para dashboard do admin com mensagem de cancelamento

### Listar Meus Pagamentos

**GET** `/api/payments/meus-pagamentos?limite=10&pagina=1`

**Autenticação:** Bearer Token (JWT)

**Response:**
```json
{
  "success": true,
  "data": {
    "pagamentos": [
      {
        "id": 456,
        "valor": 20.0,
        "status": "aprovado",
        "metodo_pagamento": "pix",
        "data_criacao": "2024-06-20T14:00:00Z",
        "data_atualizacao": "2024-06-20T14:05:00Z",
        "reserva": {
          "id": 123,
          "horario_entrada": "2024-06-20T14:00:00Z",
          "horario_saida": "2024-06-20T16:00:00Z",
          "status": "confirmada"
        },
        "estacionamento": {
          "id": 1,
          "nome": "Estacionamento Centro",
          "endereco": "Rua Principal, 123"
        }
      }
    ],
    "paginacao": {
      "total": 15,
      "pagina": 1,
      "total_paginas": 2,
      "itens_por_pagina": 10
    }
  }
}
```

### Webhook de Pagamento

**POST** `/api/payments/webhook/:provedor`

**Autenticação:** Assinatura HMAC no header

**Headers:**
```
X-Signature: sha256=abc123def456...
Content-Type: application/json
```

**Request Body (exemplo PIX):**
```json
{
  "pix": [
    {
      "txid": "PARKNOW1234567890",
      "valor": 20.0,
      "horario": "2024-06-20T14:05:00Z",
      "pagador": {
        "nome": "João Silva",
        "cpf": "12345678901"
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "processado": true,
    "txid": "PARKNOW1234567890",
    "status": "processado"
  }
}
```

---

## Diagrama de Fluxo

### Fluxo Completo de Pagamento PIX

```
┌─────────────┐
│   Cliente   │
└──────┬──────┘
       │
       │ 1. Criar reserva com pagamento PIX
       ▼
┌────────────────────────────────────┐
│  POST /api/reservas/com-pagamento  │
└──────────────┬─────────────────────┘
               │
               │ 2. Validar dados da reserva
               ▼
┌────────────────────────────────────┐
│   reservaService.criar...          │
└──────────────┬─────────────────────┘
               │
               │ 3. Criar reserva no DB
               │ 4. Processar pagamento PIX
               ▼
┌────────────────────────────────────┐
│ estacionamentoPaymentProcessing... │
│   - Buscar config PIX do estac.    │
│   - Gerar QR Code real             │
│   - Criar pagamento no DB          │
└──────────────┬─────────────────────┘
               │
               │ 5. Retornar QR Code e dados PIX
               ▼
┌─────────────┐
│   Cliente   │
│ (exibe QR)  │
└──────┬──────┘
       │
       │ 6. Cliente paga no app do banco
       │ 7. Cliente clica "Paguei"
       ▼
┌────────────────────────────────────┐
│ POST /api/reservas/:id/notificar...│
└──────────────┬─────────────────────┘
               │
               │ 8. Atualizar status: "aguardando_confirmacao"
               │ 9. Gerar tokens de confirmação/cancelamento
               │ 10. Enviar email ao estacionamento
               ▼
┌─────────────────────┐
│  Estacionamento     │
│  (recebe email)     │
└──────┬──────────────┘
       │
       │ 11. Estacionamento clica em "Confirmar Pagamento"
       ▼
┌────────────────────────────────────┐
│ GET /api/reservas/:id/confirmar... │
└──────────────┬─────────────────────┘
               │
               │ 12. Validar token
               │ 13. Atualizar pagamento: "aprovado"
               │ 14. Confirmar reserva
               │ 15. Enviar email ao cliente
               │ 16. Criar notificações
               ▼
┌─────────────┐
│   Cliente   │
│ (confirmado)│
└─────────────┘
```

### Fluxo de Expiração Automática

```
┌──────────────┐
│  Cron Job    │ (executa a cada 5 minutos)
└──────┬───────┘
       │
       │ 1. Buscar pagamentos pendentes > 30 minutos
       ▼
┌────────────────────────────────────┐
│ pixPaymentController.verificar...  │
└──────────────┬─────────────────────┘
               │
               │ 2. Para cada reserva expirada:
               ▼
         ┌─────────────┐
         │ Cancelar    │
         │ reserva     │
         └──────┬──────┘
                │
                │ 3. Liberar vaga
                │ 4. Enviar email ao cliente
                │ 5. Criar notificação
                │ 6. Emitir evento Socket.IO
                ▼
         ┌─────────────┐
         │  Cliente    │
         │ (notificado)│
         └─────────────┘
```

---

## Configuração do Estacionamento

### Cadastrar Chave PIX

**Endpoint:** `POST /api/estacionamentos/:id/configuracao-pagamento`

**Autenticação:** Bearer Token (Admin)

**Request Body:**
```json
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

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "estacionamento_id": 1,
    "tipo_chave_pix": "CNPJ",
    "chave_pix": "12345678000190",
    "nome_titular": "Estacionamento XYZ LTDA",
    "banco": "Banco do Brasil",
    "tipo_conta": "CONTA_CORRENTE",
    "agencia": "1234",
    "conta": "567890",
    "data_criacao": "2024-06-20T10:00:00Z"
  },
  "message": "Configuração de pagamento cadastrada com sucesso"
}
```

### Validação Automática

O sistema automaticamente valida:
- ✅ Formato da chave PIX (CPF, CNPJ, Email, Telefone, Aleatória)
- ✅ CNPJ da chave PIX corresponde ao CNPJ do estacionamento
- ✅ Nome do titular não está vazio
- ✅ Dados bancários opcionais estão no formato correto

---

## Monitoramento e Logs

### Logs Estruturados (Winston)

Todos os eventos de pagamento são registrados:

```javascript
// Log de criação de pagamento
{
  level: 'info',
  message: 'Pagamento criado com sucesso',
  timestamp: '2024-06-20T14:00:00Z',
  pagamento_id: 456,
  reserva_id: 123,
  metodo: 'pix',
  valor: 20.0,
  usuario_id: 10
}

// Log de erro
{
  level: 'error',
  message: 'Erro ao processar pagamento',
  timestamp: '2024-06-20T14:00:00Z',
  error: 'Estacionamento não configurado para PIX',
  stack: '...',
  reserva_id: 123,
  dados_pagamento: '*** DADOS OCULTOS ***'
}
```

### Métricas Importantes

1. **Taxa de Conversão:**
   - Reservas criadas vs. pagamentos confirmados
   - Tempo médio entre criação e confirmação

2. **Métodos de Pagamento:**
   - Distribuição: PIX, Cartão, Dinheiro
   - Taxa de sucesso por método

3. **Expiração:**
   - % de pagamentos que expiram
   - Tempo médio até expiração

4. **Erros:**
   - Taxa de falhas por método
   - Tipos de erro mais comuns

---

## Próximas Melhorias

### Curto Prazo

1. ✅ **Integração com Gateway Real:**
   - Stripe para cartões internacionais
   - Pagar.me ou PagSeguro para cartões brasileiros

2. ✅ **Webhook Automático PIX:**
   - Integração com API do Banco Central
   - Confirmação automática sem ação manual

3. ✅ **Parcelamento:**
   - Suporte a múltiplas parcelas
   - Cálculo de juros

4. ✅ **Reembolso Automático:**
   - Processamento de estornos
   - Histórico de reembolsos

### Médio Prazo

1. ✅ **Boleto Bancário:**
   - Geração de boletos
   - Integração com bancos

2. ✅ **Carteira Digital:**
   - Google Pay, Apple Pay
   - Samsung Pay

3. ✅ **Programa de Fidelidade:**
   - Cashback em pagamentos
   - Descontos progressivos

4. ✅ **Relatórios Financeiros:**
   - Dashboard de receitas
   - Exportação de extratos

### Longo Prazo

1. ✅ **Machine Learning:**
   - Detecção de fraudes
   - Previsão de inadimplência

2. ✅ **Multi-Currency:**
   - Suporte a múltiplas moedas
   - Conversão automática

3. ✅ **Blockchain:**
   - Pagamentos em criptomoedas
   - Smart contracts para reservas

---

## Conclusão

O sistema de pagamento do ParkNow é **robusto**, **seguro** e **escalável**. Ele suporta múltiplos métodos de pagamento, com foco especial em PIX (o método mais popular no Brasil).

### Pontos Fortes:

✅ **QR Code PIX Real:** Utiliza bibliotecas oficiais para gerar payloads conforme padrão BR Code  
✅ **Transações ACID:** Garante integridade dos dados  
✅ **Notificações em Tempo Real:** Socket.IO para atualizações instantâneas  
✅ **Segurança:** Ocultação de dados sensíveis, validação rigorosa  
✅ **Auditoria Completa:** Logs estruturados e triggers de banco de dados  
✅ **Expiração Automática:** Previne reservas pendentes indefinidamente  
✅ **Confirmação Manual PIX:** Flexibilidade para estacionamentos sem integração bancária  

### Áreas de Melhoria:

🔄 **Webhook Automático PIX:** Eliminar necessidade de confirmação manual  
🔄 **Gateway de Pagamento Real:** Integrar Stripe/Pagar.me para cartões  
🔄 **Testes Automatizados:** Aumentar cobertura de testes  
🔄 **Documentação Swagger:** API docs interativa  
🔄 **Monitoramento APM:** Integrar New Relic/Datadog  

---

**Última Atualização:** 2024-11-07  
**Versão do Sistema:** 1.0.0  
**Autor:** ParkNow Development Team
