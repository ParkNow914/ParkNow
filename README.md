# ParkNow - Backend (Node.js - Versão Completa)

[![GitHub release](https://img.shields.io/github/v/release/ParkNow914/ParkNow?style=flat-square)](https://github.com/ParkNow914/ParkNow/releases)
[![GitHub license](https://img.shields.io/github/license/ParkNow914/ParkNow?style=flat-square)](https://github.com/ParkNow914/ParkNow/blob/main/LICENSE)
[![CI/CD](https://github.com/ParkNow914/ParkNow/actions/workflows/ci.yml/badge.svg)](https://github.com/ParkNow914/ParkNow/actions/workflows/ci.yml)
[![Validação](https://github.com/ParkNow914/ParkNow/actions/workflows/validate.yml/badge.svg)](https://github.com/ParkNow914/ParkNow/actions/workflows/validate.yml)
[![CodeQL](https://github.com/ParkNow914/ParkNow/actions/workflows/codeql.yml/badge.svg)](https://github.com/ParkNow914/ParkNow/actions/workflows/codeql.yml)
[![GitHub issues](https://img.shields.io/github/issues/ParkNow914/ParkNow?style=flat-square)](https://github.com/ParkNow914/ParkNow/issues)
[![GitHub stars](https://img.shields.io/github/stars/ParkNow914/ParkNow?style=flat-square)](https://github.com/ParkNow914/ParkNow/stargazers)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13%2B-blue?style=flat-square&logo=postgresql)](https://www.postgresql.org/)

Este projeto representa o backend do sistema de gerenciamento de estacionamento ParkNow, utilizando Node.js, Express.js, PostgreSQL e tecnologias adicionais para segurança, tempo real e robustez.

## Descrição

O ParkNow visa oferecer uma experiência fluida tanto para motoristas que procuram vagas quanto para administradores que gerenciam estacionamentos. Esta versão implementa uma API RESTful completa com as seguintes funcionalidades principais:

*   **Autenticação Segura:** Cadastro e login para usuários e administradores usando JWT (Access Tokens + Refresh Tokens em cookies `httpOnly`). Senhas hasheadas com Argon2id.
*   **Recuperação de Senha:** Fluxo completo de "Esqueci Minha Senha" via email (requer configuração SMTP).
*   **Gerenciamento de Perfil:** Usuários podem visualizar e editar seus dados.
*   **Mapa Interativo:** Clientes visualizam estacionamentos próximos em um mapa Leaflet.
*   **Visualização de Vagas:** Detalhes de vagas (livre/ocupada/reservada) por estacionamento.
*   **Agendamento/Ocupação:** Clientes podem ocupar vagas livres diretamente.
*   **Reserva Antecipada:** Clientes podem reservar vagas específicas para horários futuros, com verificação de disponibilidade no período.
*   **Tempo Real (Básico):** Atualizações de status de vagas são enviadas para clientes conectados na página do estacionamento via Socket.IO.
*   **Painel Admin:** Interface web para administradores gerenciarem:
    *   Vagas (visualização, entrada/saída manual).
    *   Estacionamentos (CRUD - Criar, Listar, Editar, Excluir).
    *   Usuários (Listar, Ativar/Desativar).
*   **Tarefas Agendadas:** Expiração automática de reservas não utilizadas e atualização periódica de tempo estacionado no banco (`node-cron`).
*   **Sistema de Pagamento Integrado:** Suporte a pagamentos via PIX (QR Code) e cartão (crédito/débito).
*   **Segurança:** Implementa `helmet`, rate limiting (`express-rate-limit`), validação de entrada (`express-validator`), e proteção CSRF implícita via `sameSite` cookies.
*   **Logging:** Logs estruturados e persistentes com `Winston`.
*   **Validação de Chave PIX:** Verificação automática de CNPJ para chaves PIX de estacionamentos.

## Configuração do Ambiente de Desenvolvimento

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis de ambiente necessárias:

```env
# Configurações do Banco de Dados
DB_HOST=localhost
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=nome_do_banco

# Configurações de Autenticação
JWT_SECRET=seu_segredo_jwt
JWT_REFRESH_SECRET=seu_segredo_refresh_jwt

# Configurações de E-mail (para recuperação de senha)
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_USER=seu_email@provedor.com
SMTP_PASS=sua_senha_email

Execute o script de migração para criar as tabelas necessárias:

```bash
# Acesse o container do banco de dados (se estiver usando Docker)
docker-compose exec db psql -U postgres -d parknow_db -f /docker-entrypoint-initdb.d/migrations/20240620_add_payment_columns_to_reservas.sql

# Ou execute diretamente no seu banco de dados local
psql -U seu_usuario -d parknow_db -f migrations/20240620_add_payment_columns_to_reservas.sql
```

### Dados de Teste

Para popular o banco de dados com dados de teste, execute:

```bash
node scripts/seed-payment-data.js
```

Isso criará:
- Um usuário de teste (email: teste@parknow.com.br, senha: senha123)
- Um estacionamento de teste com configuração de pagamento PIX
- 10 vagas de teste

## Pré-requisitos

*   [Node.js](https://nodejs.org/) (v16 ou superior recomendado)
*   [npm](https://www.npmjs.com/) ou [yarn](https://yarnpkg.com/)
*   [Git](https://git-scm.com/)
*   [PostgreSQL](https://www.postgresql.org/) (v12 ou superior recomendado) - Pode ser executado via [Docker](https://www.docker.com/) ou instalado localmente
*   **Opcional (Recomendado):** Servidor [Redis](https://redis.io/) (para blacklist de JWT - pode ser via Docker ou serviço cloud).
*   **Opcional (Para Reset Senha):** Credenciais de um servidor SMTP (SendGrid, Mailgun, Mailtrap para teste, etc.).

## Instalação e Setup

1.  **Clone o Repositório:**
    ```bash
    git clone <url_do_seu_repositorio> parknow-node
    cd parknow-node
    ```

2.  **Instale as Dependências:**
    ```bash
    npm install
    # ou: yarn install
    ```

3.  **Configure o Banco de Dados:**
    *   Inicie seu servidor PostgreSQL.
    *   Crie um banco de dados (ex: `parknow_db`).
    *   Execute o script `scripts/create-postgres-tables.sql` para criar a estrutura do banco de dados.
    *   **Se estiver migrando de uma versão anterior**, certifique-se de fazer backup dos dados antes de prosseguir.

4.  **Configure as Variáveis de Ambiente:**
    *   **Copie `.env.example` para `.env`:** `cp .env.example .env` (Linux/Mac) ou `copy .env.example .env` (Windows).
    *   **Edite o arquivo `.env`:** Preencha **TODAS** as variáveis com seus valores:
        *   Credenciais do Banco de Dados (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
        *   **Gerar segredos JWT FORTES** para `JWT_SECRET` e `JWT_REFRESH_SECRET`. Use um gerador de senhas seguras.
        *   Configurações de Email (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`) se for usar o reset de senha.
        *   Configurações do Redis (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`) se for usar Redis para blacklist.
        *   `FRONTEND_URL` (URL base onde o frontend será acessado).
        *   Ajuste `NODE_ENV` para `production` em ambiente de produção.

## Rodando a Aplicação

*   **Modo de Desenvolvimento:**
    *   Inicia o servidor com `nodemon`, que reinicia automaticamente ao salvar arquivos. Ideal para desenvolver.
    ```bash
    npm run dev
    ```

*   **Modo de Produção:**
    *   Inicia o servidor usando Node diretamente. Garanta que `NODE_ENV=production` esteja definido no ambiente ou no script de inicialização.
    ```bash
    npm start
    # ou: NODE_ENV=production node server.js
    ```
*   **Acesso:** A aplicação estará rodando na URL definida por `FRONTEND_URL` ou `http://localhost:PORT` (ex: `http://localhost:3000`).

## Testando a Integração de Pagamento

### 1. Criando uma Reserva com Pagamento PIX

```http
POST /api/reservas/com-pagamento
Content-Type: application/json
Authorization: Bearer SEU_JWT_TOKEN

{
  "estacionamento_id": 1,
  "data_entrada": "2024-06-20T14:00:00-03:00",
  "data_saida": "2024-06-20T16:00:00-03:00",
  "valor": 20.0,
  "veiculo_placa": "ABC1D23",
  "veiculo_modelo": "Fiat Uno",
  "metodo_pagamento": "pix"
}
```

### 2. Verificando o Status do Pagamento

```http
GET /api/pagamentos/{id_pagamento}/status
Authorization: Bearer SEU_JWT_TOKEN
```

### 3. Configurando o Webhook (Produção)

Configure o webhook para apontar para:
```
https://seu-dominio.com/api/webhooks/mercado-pago
```

## Estrutura do Projeto

PI_NODE/
├── config/ # Configuração (DB, JWT, Email, Cache, Redis)
├── controllers/ # Lógica de aplicação (manipula requisições)
├── logs/ # Arquivos de log (gerados pelo Winston)
├── middleware/ # Middlewares (Auth, Erro, Validação, Upload)
│   └── validatePixKey.js # Validação de chave PIX
├── models/ # Camada de acesso a dados (interage com DB)
├── public/ # Arquivos estáticos do Frontend (HTML, CSS, JS, Imagens)
├── routes/ # Definição das rotas da API
│   ├── reservaPagamentoRoutes.js # Rotas para reservas com pagamento
│   └── estacionamentoPaymentConfigRoutes.js # Rotas para configuração de pagamento
├── services/ # Serviços (Socket.IO, Tarefas Agendadas/Cron)
├── uploads/ # Pasta para arquivos de upload (fotos de estacionamento)
├── utils/ # Utilitários (Auth, Erros, Email, Log, Cache, Token, etc.)
├── .env # Variáveis de ambiente (NÃO VERSIONAR)
├── .env.example # Exemplo de variáveis de ambiente
├── .gitignore # Arquivos ignorados pelo Git
├── package.json # Metadados e dependências
├── package-lock.json # Lock das dependências
└── server.js # Ponto de entrada da aplicação

## Variáveis de Ambiente (`.env`)

Consulte o arquivo `.env.example` para ver a lista completa de variáveis necessárias e seus propósitos. É crucial configurar corretamente `DB_*`, `JWT_*`, e `EMAIL_*` para a funcionalidade completa.

## API Endpoints Principais

(Uma documentação mais formal usando Swagger/OpenAPI seria ideal para produção)

*   **Autenticação (`/api/auth`)**:
    *   `POST /register`: Registro de usuário.
    *   `POST /login`: Login de usuário (retorna `accessToken`, seta cookie `refreshToken`).
    *   `POST /admin/register`: Registro de admin + estacionamento inicial (requer upload `fotoEstacionamento` opcional).
    *   `POST /admin/login`: Login de admin.
    *   `POST /refresh-token`: Obtém novo `accessToken` usando `refreshToken` do cookie.
    *   `POST /logout`: Invalida `refreshToken` (limpa hash DB/cookie, adiciona à blacklist).
    *   `POST /forgot-password`: Envia email de reset.
    *   `POST /reset-password/:token`: Define nova senha usando token.
*   **Usuário (`/api/user`)**: _(Requer Auth Usuário)_
    *   `GET /profile`: Obtém perfil do usuário logado.
    *   `PUT /profile`: Atualiza perfil do usuário logado.
*   **Estacionamentos (`/api/estacionamentos`)**: _(Requer Auth Usuário)_
    *   `GET /`: Lista todos os estacionamentos (para mapa).
    *   `GET /:id`: Detalhes de um estacionamento.
    *   `GET /:id/vagas`: Lista vagas de um estacionamento.
    *   `GET /vagas/livres`: Conta vagas livres (pode filtrar por `?estacionamentoId=X`).
    *   `POST /vagas/:vagaId/agendar`: Ocupa uma vaga livre/reservada.
    *   `GET /vagas/:vagaId/tempo`: Obtém tempo estacionado atual.
*   **Reservas (`/api/reservas`)**: _(Requer Auth Usuário)_
    *   `POST /`: Cria uma nova reserva.
    *   `GET /minhas`: Lista reservas do usuário logado.
    *   `DELETE /:reservaId/cancelar`: Cancela uma reserva ativa.
*   **Admin API (`/api/admin`)**: _(Requer Auth Admin)_
    *   `GET /vagas`, `GET /vagas/ocupadas`, `GET /vagas/:id/tempo-db`: Visualização de vagas.
    *   `POST /vagas/:numero/entrada`, `POST /vagas/:id/saida`: Gerenciamento manual de vagas.
    *   `POST /vagas/atualizar-tempo`: Endpoint (opcional) para forçar atualização de tempo no DB.
    *   `GET /estacionamentos`, `POST /estacionamentos`, `GET /estacionamentos/:id`, `PUT /estacionamentos/:id`, `DELETE /estacionamentos/:id`: CRUD de Estacionamentos.
    *   `PUT /config/vagas`: Ajusta número total de vagas.
    *   `GET /users`, `PATCH /users/:userId/status`: Gerenciamento de Usuários.

## Tecnologias Utilizadas

*   **Backend:** Node.js, Express.js
*   **Banco de Dados:** PostgreSQL (`pg`)
*   **Autenticação:** JWT (`jsonwebtoken`), Cookies (`cookie-parser`), Argon2 (`argon2`), Bcrypt (`bcrypt` para hash de refresh token)
*   **Validação:** `express-validator`
*   **Segurança:** `helmet`, `express-rate-limit`, `cors`
*   **Tempo Real:** Socket.IO (`socket.io`)
*   **Tarefas Agendadas:** `node-cron`
*   **Email:** Nodemailer (`nodemailer`)
*   **Logging:** Winston (`winston`), Morgan (`morgan`)
*   **Cache (Simples):** `node-cache`
*   **Blacklist (Opcional):** Redis (`ioredis`)
*   **Upload:** Multer (`multer`)
*   **Outros:** `dotenv`, `crypto`, `uuid`

## TODO / Próximos Passos (Pós-Implementação)

*   **Configuração de Ambiente:** Definir corretamente TODAS as variáveis no `.env` (DB, JWT, Email, Redis).
*   **Testes Automatizados:** Implementar testes unitários, de integração e E2E.
*   **Refinamento da UI/UX:** Melhorar a interface do admin e o feedback visual geral.
*   **Pagamento:** Integrar gateway de pagamento, se necessário.
*   **HTTPS:** Configurar proxy reverso (Nginx) e SSL (Let's Encrypt) para produção.
*   **Monitoramento:** Configurar monitoramento de performance e erros em produção.
*   **Documentação da API:** Gerar documentação formal (Swagger/OpenAPI).

## Contribuição

(Instruções sobre como contribuir, se aplicável)

## Licença

(Informações sobre a licença do projeto, se aplicável)
