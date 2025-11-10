# 🏗️ Arquitetura do Sistema ParkNow

## 📋 Visão Geral

O **ParkNow** é uma plataforma de gerenciamento de estacionamentos com pagamentos 100% automatizados via **ASAAS**.

---

## 👥 Tipos de Usuário

### 1️⃣ **Administradores (Donos de Estacionamento)**

- **Cadastro:** `/api/auth/admin/register`
- **Perfil:** Donos de estacionamento que gerenciam suas vagas
- **Permissões:**
  - Criar e gerenciar estacionamento
  - Configurar valores (hora, diária, mensal)
  - Visualizar reservas e pagamentos
  - Configurar dados de recebimento ASAAS
  - Dashboard administrativo completo

### 2️⃣ **Usuários (Motoristas)**

- **Cadastro:** `/api/auth/register`
- **Perfil:** Motoristas que procuram e reservam vagas
- **Permissões:**
  - Buscar estacionamentos disponíveis
  - Fazer reservas com pagamento automático
  - Visualizar histórico de reservas
  - Gerenciar veículos cadastrados

---

## 💳 Sistema de Pagamentos

### Gateway: **ASAAS** (100% Automatizado)

#### Fluxo de Pagamento:

1. **Usuário cria reserva** → Sistema calcula valor
2. **Sistema cria cobrança no ASAAS** → Gera QR Code PIX ou link de pagamento
3. **Usuário paga** → ASAAS processa pagamento
4. **Webhook ASAAS notifica sistema** → Status atualizado automaticamente
5. **Split automático:**
   - **85%** → Conta do estacionamento
   - **15%** → Taxa da plataforma

#### Métodos de Pagamento Suportados:
- ✅ **PIX** (instantâneo)
- ✅ **Cartão de Crédito**
- ✅ **Cartão de Débito**
- ✅ **Boleto Bancário**

---

## 🔄 Fluxo de Reserva com Pagamento

```
[Usuário] 
    ↓
[Seleciona vaga e horário]
    ↓
[POST /api/reservas/com-pagamento]
    ↓
[Sistema valida disponibilidade]
    ↓
[Sistema cria cobrança no ASAAS]
    ↓
[ASAAS retorna QR Code/Link]
    ↓
[Usuário recebe dados de pagamento]
    ↓
[Usuário paga via PIX/Cartão]
    ↓
[ASAAS processa pagamento]
    ↓
[Webhook POST /api/webhooks/asaas]
    ↓
[Sistema atualiza status → CONFIRMADO]
    ↓
[Split automático executado]
    ↓
[Notificação enviada ao usuário]
```

---

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais:

1. **admins** - Donos de estacionamento
2. **usuarios** - Motoristas
3. **estacionamentos** - Dados dos estacionamentos
4. **vagas** - Vagas individuais
5. **reservas** - Reservas de vagas
6. **pagamentos** - Transações de pagamento
7. **estacionamento_pagamentos** - Config de recebimento ASAAS

### Relacionamentos:
- Admin → Estacionamento (1:N)
- Estacionamento → Vagas (1:N)
- Usuário → Reservas (1:N)
- Reserva → Pagamento (1:1)
- Estacionamento → Configuração ASAAS (1:1)

---

## 🔐 Autenticação e Segurança

### JWT (JSON Web Tokens)
- **Access Token:** 15 minutos (Bearer Token)
- **Refresh Token:** 7 dias (httpOnly cookie)

### Proteção de Rotas:
- `protectUser` → Rotas de usuário autenticado
- `protectAdmin` → Rotas de administrador

### Segurança Implementada:
- ✅ Helmet (HTTP headers)
- ✅ Rate Limiting (proteção contra DDoS)
- ✅ CORS configurado
- ✅ Senhas hasheadas com Argon2
- ✅ Validação de entrada (express-validator)
- ✅ Proteção CSRF via SameSite cookies

---

## 📡 Webhooks ASAAS

### Endpoint: `POST /api/webhooks/asaas`

#### Eventos Processados:
- `PAYMENT_CONFIRMED` → Pagamento confirmado
- `PAYMENT_RECEIVED` → Pagamento recebido
- `PAYMENT_OVERDUE` → Pagamento vencido
- `PAYMENT_REFUNDED` → Pagamento estornado

#### Fluxo de Webhook:
1. ASAAS envia notificação
2. Sistema valida assinatura
3. Atualiza status do pagamento
4. Executa split se necessário
5. Notifica usuário via Socket.IO/Email
6. Atualiza disponibilidade da vaga

---

## 🚀 Endpoints Principais da API

### Autenticação
- `POST /api/auth/register` - Cadastro de usuário (motorista)
- `POST /api/auth/admin/register` - Cadastro de admin (dono)
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh-token` - Renovar token

### Estacionamentos
- `GET /api/estacionamentos` - Listar estacionamentos
- `GET /api/estacionamentos/:id` - Detalhes do estacionamento
- `GET /api/estacionamentos/:id/vagas` - Vagas disponíveis

### Reservas e Pagamentos
- `POST /api/reservas/com-pagamento` - Criar reserva com pagamento
- `GET /api/pagamentos/:id/status` - Status do pagamento
- `POST /api/webhooks/asaas` - Webhook de pagamento (público)

### Admin
- `GET /api/admin/reservas` - Listar todas as reservas
- `GET /api/admin/pagamentos` - Listar pagamentos
- `PUT /api/admin/estacionamentos/:id` - Atualizar estacionamento

---

## ⚙️ Variáveis de Ambiente Essenciais

```env
# Banco de Dados
PG_HOST=localhost
PG_USER=postgres
PG_PASSWORD=sua_senha
PG_DATABASE=parknow_db

# JWT
JWT_SECRET=seu_secret_jwt
JWT_REFRESH_SECRET=seu_secret_refresh

# Email
EMAIL_USER=seu_email@gmail.com
EMAIL_PASS=sua_senha_app

# ASAAS
ASAAS_SANDBOX=true
ASAAS_SANDBOX_API_KEY=sua_chave_sandbox
ASAAS_API_KEY=sua_chave_producao
ASAAS_PLATFORM_FEE_PERCENT=15.0
ASAAS_WEBHOOK_URL=https://seu-dominio.com/api/webhooks/asaas
```

---

## 🎯 Diferenças Importantes

### ❌ O que NÃO temos:
- ~~PIX Manual com confirmação por email~~
- ~~Mercado Pago~~
- ~~Stripe~~
- ~~Pagamentos manuais~~

### ✅ O que TEMOS:
- **ASAAS 100% automatizado**
- **Split automático de pagamentos**
- **Webhooks em tempo real**
- **Múltiplos métodos de pagamento**
- **Dashboard completo para admins**

---

## 📊 Status de Pagamento

1. **PENDING** - Aguardando pagamento
2. **CONFIRMED** - Pagamento confirmado
3. **RECEIVED** - Valor recebido
4. **OVERDUE** - Pagamento vencido
5. **REFUNDED** - Pagamento estornado
6. **CANCELLED** - Pagamento cancelado

---

## 🔧 Tecnologias Utilizadas

- **Backend:** Node.js + Express.js
- **Banco de Dados:** PostgreSQL
- **Gateway de Pagamento:** ASAAS
- **Autenticação:** JWT
- **WebSocket:** Socket.IO
- **Email:** Nodemailer
- **Logs:** Winston
- **Tarefas Agendadas:** node-cron
- **Segurança:** Helmet, express-rate-limit, Argon2

---

## 📝 Resumo

**ParkNow** é uma plataforma onde:
- **Donos de estacionamento** se cadastram como **ADMINS** e gerenciam seus negócios
- **Motoristas** se cadastram como **USUÁRIOS** e fazem reservas
- **Todos os pagamentos** são processados automaticamente via **ASAAS**
- **Split automático** garante que cada parte receba sua porcentagem
- **Zero intervenção manual** no processo de pagamento
