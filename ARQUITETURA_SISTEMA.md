# 🏗️ Arquitetura do Sistema ParkNow

> Atualizado em 2026-06. Reflete a stack **always free** atual: pagamento via
> **PIX manual** (BR Code gerado localmente, confirmação pelo admin), sem
> gateway de pagamento. As referências a Stripe/ASAAS sobrevivem apenas no
> histórico de migrations.

## 📋 Visão Geral

O **ParkNow** é uma plataforma de gerenciamento de estacionamentos com reserva
de vagas, mapa interativo, notificações em tempo real (Socket.IO) e pagamento
via **PIX direto na chave do estacionamento**, com confirmação manual do
comprovante pelo administrador.

- **Backend:** Node.js 18+ / Express 4 / PostgreSQL (pg + Sequelize)
- **Frontend:** páginas estáticas em `public/` (vanilla JS + jQuery + Bootstrap
  + Leaflet + React UMD pontual)
- **Tempo real:** Socket.IO (salas por usuário, por estacionamento e de admins)
- **Deploy:** Fly.io (região GRU) ou Oracle Cloud Always Free via Terraform

---

## 👥 Tipos de Usuário

### 1️⃣ Administradores (donos de estacionamento)

- **Cadastro:** `POST /api/auth/admin/register` (cria admin + estacionamento)
- **Permissões:** gerenciar o próprio estacionamento, vagas e preços; cadastrar
  a **chave PIX** de recebimento; ver a fila de comprovantes e
  confirmar/rejeitar pagamentos; dashboard administrativo.
- **RBAC:** todo endpoint admin valida ownership (`estacionamentos.admin_id`)
  — um admin não enxerga nem opera dados de outro estacionamento.

### 2️⃣ Usuários (motoristas)

- **Cadastro:** `POST /api/auth/register` (com verificação de e-mail por token)
- **Permissões:** buscar estacionamentos no mapa, reservar vaga, pagar via PIX
  e enviar comprovante, acompanhar status em tempo real, gerenciar perfil.

---

## 💳 Sistema de Pagamentos (PIX manual, sem gateway)

1. **Usuário cria a reserva** → `POST /api/reservas/com-pagamento`
2. **Backend gera o BR Code localmente** (`utils/pixBrCode.js`, padrão
   EMV/Bacen com CRC16) → QR Code + copia-e-cola apontando para a **chave PIX
   do estacionamento**. Sem custo por transação.
3. **Usuário paga no app do banco** e anexa o comprovante:
   `POST /api/reservas/:id/comprovante` (multipart, autenticado, rate-limited)
4. **Admin vê a fila** em `GET /api/admin/pagamentos/aguardando-confirmacao`
   e baixa o comprovante por `GET /api/admin/pagamentos/:id/comprovante`
   (endpoint autenticado — comprovantes NÃO são servidos estaticamente)
5. **Admin confirma** `POST /api/admin/reservas/:id/confirmar-pagamento`
   (transação com `FOR UPDATE`; pagamento → `aprovado`, reserva →
   `confirmada`, vaga → `ocupada`) **ou rejeita** com motivo
   (`POST /api/admin/reservas/:id/rejeitar-pagamento`; usuário pode reenviar).
6. **Usuário é notificado** via Socket.IO (sala `usuario_<id>`).

**Expiração automática:** reservas PIX pendentes além de
`PIX_PENDING_TIMEOUT_MIN` (default 30 min) são canceladas pelo agendador
interno, o pagamento é marcado `cancelado` e **a vaga é liberada**. Reservas
pendentes cujo horário de entrada passou sem check-in expiram da mesma forma.

---

## 🔁 Tarefas agendadas

`services/cronJobs.js` (node-cron, in-process) chama os serviços diretamente:

| Tarefa | Schedule | Serviço |
|---|---|---|
| Expirar reservas pendentes vencidas (libera vagas) | `CRON_EXPIRE_RESERVAS` (default `*/5min`) | `reservaMaintenanceService.expirarReservasPendentes` |
| Cancelar PIX pendente expirado (libera vagas) | `*/5min` | `pixExpirationService.cancelarReservasExpiradas` |
| Atualizar tempo estacionado | `CRON_UPDATE_TEMPO` (default `*/1min`) | `vagaModel.updateAllTemposEstacionados` |

Os mesmos serviços são expostos para acionamento **externo** em
`POST /api/cron/verificar-reservas-expiradas` e
`POST /api/cron/expirar-reservas-pendentes`, protegidos por `CRON_API_KEY`
(header `x-api-key`; fail-closed se a variável não estiver configurada).

---

## 🗄️ Banco de Dados (PostgreSQL)

Tabelas principais: `usuarios`, `admins`, `estacionamentos`, `vagas`,
`reservas`, `pagamentos`, `veiculos`, `notificacoes`, `horarios_funcionamento`,
`estacionamento_pagamentos` (chave PIX do estacionamento),
`solicitacoes_estacionamento`, `logs_admins`, `logs_veiculos`,
`parceria_solicitacoes` (aprovações persistidas), `idempotency_keys`,
`schema_migrations` (controle de migrations).

- **Migrations:** `npm run migrate` (runner próprio em `scripts/migrate.js`
  com baseline implícito + checksums; `--status` e `--strict` disponíveis).
  Aplicam limpo em banco novo na primeira execução.
- **Acesso a dados:** majoritariamente `pg` puro (pool em `utils/dbUtils.js`);
  modelos Sequelize PascalCase ainda existem para partes do código — a
  unificação completa está no ROADMAP.

### Estados de reserva

`pendente` → (admin confirma) `confirmada` → `ativa`/`em_andamento` →
`concluida`/`finalizada`; caminhos terminais: `cancelada` (PIX expirado ou
cancelamento), `expirada` (não compareceu sem pagar), `nao_compareceu`.
Pagamentos: `pendente` → `aprovado` | `cancelado` (com `motivo_rejeicao` e
`rejeitado_em` quando o admin rejeita o comprovante).

---

## 🔐 Autenticação e Segurança

- **JWT:** access token de 15 min (Bearer) + refresh token de 7 dias em cookie
  `httpOnly`, `sameSite=lax`, path `/api/auth`; senhas com Argon2id;
  verificação de e-mail no cadastro.
- **Proteção de rotas:** `protectUser` / `protectAdmin` (com cache curto de
  dados do usuário, TTL configurável via `AUTH_USER_CACHE_TTL_MS`).
- **Uploads sensíveis nunca são públicos:** comprovantes PIX e fotos de perfil
  são entregues apenas por endpoints autenticados com checagem de ownership
  (`GET /api/admin/pagamentos/:id/comprovante`, `GET /api/user/profile/foto`);
  fotos de estacionamento (públicas por natureza) continuam estáticas.
- **Headers:** Helmet com CSP (CDNs permitidas explicitamente), HSTS,
  frameguard deny. CORS restrito a `FRONTEND_URL`.
- **Rate limiting:** login/registro/reset/refresh (v1 e v2), upload de
  comprovante e ações admin de pagamento.
- **Validação:** express-validator nas rotas; validação de env com zod no boot
  (produção aborta sem segredos); `CRON_API_KEY` fail-closed com comparação em
  tempo constante.
- **Auditoria:** middleware `auditLog` em ações sensíveis; logs estruturados
  Winston com rotação; request-id por requisição.
- **Idempotência:** header `Idempotency-Key` com store em Postgres.

---

## 📊 Observabilidade

- `GET /health` (liveness) e `GET /health/ready` (readiness com ping no DB)
- `GET /metrics` Prometheus (restrito em produção: loopback ou `METRICS_TOKEN`)
- Stack opcional em `monitoring/` (Prometheus + Grafana + exporters + alertas)
- Error tracking plugável (Sentry via `SENTRY_DSN`)

---

## 📚 Referências

- Fluxo PIX manual detalhado: [`docs/FLUXO_PIX_MANUAL.md`](docs/FLUXO_PIX_MANUAL.md)
- Guia rápido de pagamentos: [`docs/GUIA_RAPIDO_PAGAMENTOS.md`](docs/GUIA_RAPIDO_PAGAMENTOS.md)
- Deploy Oracle Free Tier: [`docs/DEPLOY_ORACLE_FREE_TIER.md`](docs/DEPLOY_ORACLE_FREE_TIER.md)
- API interativa: `GET /api/docs` (Swagger UI; JSON em `/api/docs.json`)
