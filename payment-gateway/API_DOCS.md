# Documentação da API - ParkNow Payment Gateway

Bem-vindo à documentação da API do ParkNow Payment Gateway. Este documento fornece informações detalhadas sobre como integrar e utilizar nossa API de pagamentos.

## Índice

1. [Visão Geral](#visão-geral)
2. [Autenticação](#autenticação)
3. [Endpoints](#endpoints)
   - [Pagamentos](#pagamentos)
     - [Criar Pagamento](#criar-pagamento)
     - [Consultar Pagamento](#consultar-pagamento)
     - [Listar Pagamentos](#listar-pagamentos)
   - [Webhooks](#webhooks)
     - [Configurar Webhook](#configurar-webhook)
   - [Saldos](#saldos)
     - [Consultar Saldo](#consultar-saldo)
     - [Solicitar Saque](#solicitar-saque)
4. [Códigos de Status HTTP](#códigos-de-status-http)
5. [Exemplos de Uso](#exemplos-de-uso)
6. [Limitações e Cotas](#limitações-e-cotas)
7. [Suporte](#suporte)

## Visão Geral

A API do ParkNow Payment Gateway permite a integração segura com nosso sistema de pagamentos, suportando diversos métodos de pagamento, incluindo PIX, cartão de crédito, boleto bancário e mais.

- **URL Base**: `https://api.parknow.com.br/v1`
- **Formato de Dados**: JSON
- **Autenticação**: Token de Acesso (Bearer Token)

## Autenticação

Todas as requisições para a API devem incluir um token de acesso no cabeçalho de autorização:

```
Authorization: Bearer SEU_TOKEN_AQUI
```

### Como obter um token de acesso

1. Acesse o [Painel do Desenvolvedor](https://dev.parknow.com.br)
2. Crie uma nova aplicação
3. Gere suas credenciais (Client ID e Client Secret)
4. Use o Client Credentials Flow para obter o token de acesso

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=SEU_CLIENT_ID&client_secret=SEU_CLIENT_SECRET
```

## Endpoints

### Pagamentos

#### Criar Pagamento

Cria uma nova transação de pagamento.

```http
POST /payments
Content-Type: application/json
Authorization: Bearer SEU_TOKEN_AQUI

{
  "amount": 100.50,
  "description": "Estacionamento 24h - Shopping Center",
  "payment_method": "pix",
  "payer": {
    "name": "João da Silva",
    "email": "joao@exemplo.com",
    "document": "123.456.789-09",
    "phone": "+5511999999999"
  },
  "metadata": {
    "order_id": "12345",
    "parking_lot_id": "parking-001"
  }
}
```

**Parâmetros da Requisição:**

| Parâmetro        | Tipo     | Obrigatório | Descrição                                    |
|------------------|----------|-------------|--------------------------------------------|
| amount           | number   | Sim         | Valor do pagamento em reais (ex: 100.50)   |
| description      | string   | Sim         | Descrição do pagamento                     |
| payment_method   | string   | Sim         | Método de pagamento (pix, credit_card, etc)|
| payer            | object   | Sim         | Informações do pagador                     |
| payer.name       | string   | Sim         | Nome do pagador                           |
| payer.email      | string   | Sim         | E-mail do pagador                         |
| payer.document   | string   | Não         | CPF/CNPJ do pagador (apenas números)      |
| payer.phone      | string   | Não         | Telefone do pagador com DDD e DDI        |
| metadata         | object   | Não         | Metadados adicionais                      |


**Resposta de Sucesso (200 OK):**

```json
{
  "id": "pay_123456789",
  "status": "pending",
  "amount": 100.5,
  "description": "Estacionamento 24h - Shopping Center",
  "payment_method": "pix",
  "created_at": "2023-06-01T12:00:00Z",
  "updated_at": "2023-06-01T12:00:00Z",
  "point_of_interaction": {
    "qr_code": "00020126330014BR.GOV.BCB.PIX0111+551199999999952040000530398654040.005802BR5925FULANO DE TAL6008BRASILIA62070503***6304E2CA",
    "qr_code_base64": "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACt...",
    "expiration_date": "2023-06-01T13:00:00Z"
  },
  "metadata": {
    "order_id": "12345",
    "parking_lot_id": "parking-001"
  }
}
```

#### Consultar Pagamento

Consulta os detalhes de um pagamento específico.

```http
GET /payments/pay_123456789
Authorization: Bearer SEU_TOKEN_AQUI
```

**Parâmetros da URL:**

| Parâmetro | Tipo   | Obrigatório | Descrição                  |
|-----------|--------|-------------|---------------------------|
| id        | string | Sim         | ID do pagamento           |

**Resposta de Sucesso (200 OK):**

```json
{
  "id": "pay_123456789",
  "status": "approved",
  "amount": 100.5,
  "description": "Estacionamento 24h - Shopping Center",
  "payment_method": "pix",
  "created_at": "2023-06-01T12:00:00Z",
  "updated_at": "2023-06-01T12:05:30Z",
  "paid_at": "2023-06-01T12:05:30Z",
  "transaction_details": {
    "net_received_amount": 97.5,
    "total_paid_amount": 100.5,
    "installment_amount": 100.5,
    "installment_quantity": 1,
    "payment_method_reference_id": "1234567890"
  },
  "payer": {
    "name": "João da Silva",
    "email": "joao@exemplo.com",
    "document": "123.456.789-09",
    "phone": "+5511999999999"
  },
  "metadata": {
    "order_id": "12345",
    "parking_lot_id": "parking-001"
  }
}
```

#### Listar Pagamentos

Lista os pagamentos de acordo com os filtros especificados.

```http
GET /payments?status=approved&start_date=2023-06-01&end_date=2023-06-30&limit=10&offset=0
Authorization: Bearer SEU_TOKEN_AQUI
```

**Parâmetros da Query:**

| Parâmetro  | Tipo    | Obrigatório | Descrição                                   |
|------------|---------|-------------|-------------------------------------------|
| status     | string  | Não         | Filtrar por status do pagamento           |
| start_date | string  | Não         | Data inicial (formato: YYYY-MM-DD)        |
| end_date   | string  | Não         | Data final (formato: YYYY-MM-DD)          |
| limit      | integer | Não         | Limite de resultados por página (padrão: 10) |
| offset     | integer | Não         | Deslocamento para paginação (padrão: 0)   |

**Resposta de Sucesso (200 OK):**

```json
{
  "data": [
    {
      "id": "pay_123456789",
      "status": "approved",
      "amount": 100.5,
      "description": "Estacionamento 24h - Shopping Center",
      "payment_method": "pix",
      "created_at": "2023-06-01T12:00:00Z",
      "paid_at": "2023-06-01T12:05:30Z"
    },
    {
      "id": "pay_987654321",
      "status": "pending",
      "amount": 150.75,
      "description": "Estacionamento 12h - Aeroporto",
      "payment_method": "credit_card",
      "created_at": "2023-06-02T08:30:00Z",
      "paid_at": null
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 10,
    "offset": 0,
    "has_more": false
  }
}
```

### Webhooks

#### Configurar Webhook

Configura a URL de webhook para receber notificações de atualização de status de pagamentos.

```http
POST /webhooks
Content-Type: application/json
Authorization: Bearer SEU_TOKEN_AQUI

{
  "url": "https://sua-aplicacao.com.br/webhooks/payments",
  "events": ["payment.updated", "payment.created"]
}
```

**Parâmetros da Requisição:**

| Parâmetro | Tipo     | Obrigatório | Descrição                                                       |
|-----------|----------|-------------|-----------------------------------------------------------------|
| url       | string   | Sim         | URL que receberá as notificações                                |
| events    | string[] | Sim         | Lista de eventos para se inscrever (payment.updated, etc)      |

**Resposta de Sucesso (200 OK):**

```json
{
  "id": "webhook_123456789",
  "url": "https://sua-aplicacao.com.br/webhooks/payments",
  "events": ["payment.updated", "payment.created"],
  "status": "active",
  "created_at": "2023-06-01T10:00:00Z",
  "updated_at": "2023-06-01T10:00:00Z"
}
```

### Saldos

#### Consultar Saldo

Consulta o saldo disponível para saque.

```http
GET /balance
Authorization: Bearer SEU_TOKEN_AQUI
```

**Resposta de Sucesso (200 OK):**

```json
{
  "available": 1250.75,
  "waiting_funds": 350.25,
  "transferred": 5000.00,
  "currency": "BRL",
  "last_updated": "2023-06-01T23:59:59Z"
}
```

#### Solicitar Saque

Solicita um saque para a conta bancária cadastrada.

```http
POST /withdrawals
Content-Type: application/json
Authorization: Bearer SEU_TOKEN_AQUI

{
  "amount": 1000.00,
  "bank_account_id": "bank_123456789"
}
```

**Parâmetros da Requisição:**

| Parâmetro     | Tipo   | Obrigatório | Descrição                         |
|---------------|--------|-------------|-----------------------------------|
| amount        | number | Sim         | Valor do saque                    |
| bank_account_id | string | Sim       | ID da conta bancária cadastrada   |

**Resposta de Sucesso (200 OK):**

```json
{
  "id": "withdraw_123456789",
  "amount": 1000.00,
  "net_amount": 990.00,
  "fee": 10.00,
  "status": "pending",
  "bank_account": {
    "id": "bank_123456789",
    "bank_code": "001",
    "bank_name": "Banco do Brasil",
    "account_type": "checking",
    "agency_number": "0001",
    "account_number": "12345-6",
    "holder_name": "João da Silva"
  },
  "created_at": "2023-06-01T15:30:00Z",
  "estimated_available_date": "2023-06-03"
}
```

## Códigos de Status HTTP

A API utiliza os seguintes códigos de status HTTP:

| Código | Descrição                           |
|--------|-----------------------------------|
| 200    | OK - Requisição bem-sucedida       |
| 201    | Criado - Recurso criado com sucesso |
| 400    | Requisição inválida               |
| 401    | Não autorizado                    |
| 403    | Proibido - Sem permissão          |
| 404    | Recurso não encontrado            |
| 422    | Entidade não processável          |
| 429    | Muitas requisições                |
| 500    | Erro interno do servidor          |

## Exemplos de Uso

### Exemplo 1: Criar um pagamento com PIX

```javascript
const axios = require('axios');

const API_URL = 'https://api.parknow.com.br/v1';
const ACCESS_TOKEN = 'SEU_TOKEN_AQUI';

async function createPixPayment() {
  try {
    const response = await axios.post(
      `${API_URL}/payments`,
      {
        amount: 150.75,
        description: "Estacionamento 12h - Aeroporto",
        payment_method: "pix",
        payer: {
          name: "Maria Oliveira",
          email: "maria@exemplo.com",
          document: "987.654.321-00",
          phone: "+5511988888888"
        },
        metadata: {
          order_id: "54321",
          parking_lot_id: "airport-001"
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Pagamento criado com sucesso:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erro ao criar pagamento:', error.response?.data || error.message);
    throw error;
  }
}

createPixPayment();
```

### Exemplo 2: Consultar status de um pagamento

```javascript
async function checkPaymentStatus(paymentId) {
  try {
    const response = await axios.get(
      `${API_URL}/payments/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );

    console.log('Status do pagamento:', response.data.status);
    return response.data;
  } catch (error) {
    console.error('Erro ao consultar pagamento:', error.response?.data || error.message);
    throw error;
  }
}

// Exemplo de uso
// checkPaymentStatus('pay_123456789');
```

## Limitações e Cotas

- **Limite de requisições**: 100 requisições por minuto por token de acesso
- **Tamanho máximo de payload**: 1MB
- **Tempo máximo de requisição**: 30 segundos
- **Paginação**: Máximo de 100 itens por página

## Suporte

Em caso de dúvidas ou problemas, entre em contato com nossa equipe de suporte:

- **E-mail**: suporte@parknow.com.br
- **Telefone**: +55 11 4004-1234
- **Horário de atendimento**: Segunda a Sexta, das 9h às 18h (GMT-3)

---

© 2023 ParkNow. Todos os direitos reservados.
