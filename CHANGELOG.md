# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [2.3.0] - 2026-06-15 — Esteira E2E + deploy gateado + dependências major

### CI/CD

- **Deploy gateado pelo CI**: `deploy.yml` agora dispara via `workflow_run`
  após o "CI/CD Pipeline" concluir com SUCESSO na main (antes era push direto,
  em paralelo ao CI). Comprovado em produção: 3 commits com CI vermelho foram
  BLOQUEADOS do deploy, e só o commit 100% verde foi implantado.
- **Suíte E2E (Playwright)** em browser real, como job dedicado do CI: landing,
  cadastro pelo modal, login com redirect, home (mapa Leaflet), admin e reset —
  rede de proteção das refatorações de frontend. Traces como artifact em falha.
- `workflow_dispatch` no CI (validar qualquer branch sem PR).
- Jest `maxWorkers=1`: testes de integração compartilham um único Postgres;
  serial elimina flakiness com as tabelas rate_limits/idempotency_keys.

### Dependências (majors do Dependabot, mantendo 0 vulnerabilidades)

- Express 4 → 5, Zod 3 → 4, ESLint 8 → 9 (flat config `eslint.config.js`),
  Jest 29 → 30. GitHub Actions: checkout/setup-node v6, CodeQL v4, codecov v6.

### Segurança

- **CSP sem `unsafe-inline` em `script-src`/`script-src-elem`**: os 15 blocos
  `<script>` inline das páginas servidas foram extraídos para arquivos externos;
  um `<script>` injetado por XSS não executa mais. Allowlist de CDNs enumerada
  de todos os `<script src>` reais.
- **Backup diário criptografado** do Postgres (AES-256-CBC/PBKDF2) via Actions —
  parknow-db é Legacy (sem backup da plataforma). Requer `BACKUP_PASSPHRASE`.

### Corrigido (bugs reais que a E2E pegou — estavam em produção)

- **`SyntaxError: Identifier 'PARKNOW_DEBUG' has already been declared`**: o
  gating de logs declarava `const` de mesmo nome no topo de 5 arquivos JS; a
  landing carrega 4 deles como scripts clássicos no mesmo escopo → o
  `index.js` era abortado e login/cadastro da página inicial não funcionavam.
  Corrigido para forma idempotente (`window.PARKNOW_DEBUG` + `function debugLog`).
- **CSP bloqueava Bootstrap** de `stackpath.bootstrapcdn.com` e DataTables de
  `cdn.datatables.net` (modais não abriam no reset-password e afins).
- Bug de schema em banco novo: `public/js/timeService.js` (ESM morto) quebrava
  o lint; removido.

### Refatoração

- `admin_home/script.js`: validadores puros (CPF/CNPJ/CEP) extraídos para
  `admin-validators.js` (testáveis). Husky + lint-staged no pre-commit.
- Limpeza de diretivas `eslint-disable` obsoletas.

## [2.2.0] - 2026-06-11 — Top-tier: zero vulnerabilidades, upload blindado, rate limit persistente

### Segurança

- **30 → 0 vulnerabilidades npm** (1 crítica, 17 high): axios/ws/brace-expansion
  e demais corrigidas; nodemailer 8.0.11 (SMTP command injection); override de
  uuid ^11.1.1 dentro do Sequelize; lockfile regenerado.
- **Upload blindado** (`utils/uploadSecurity.js`): magic bytes do arquivo REAL
  (mimetype do cliente não é confiável), re-encode de imagens via sharp
  (remove EXIF/GPS, valida decodificação, neutraliza poliglotas) e
  **anti-duplicação por SHA-256** — o mesmo comprovante reutilizado em outra
  reserva é rejeitado com 409. 7 testes com payloads disfarçados.
- **Rate limiting persistente no Postgres** (`utils/pgRateLimitStore.js`):
  contadores de login/registro/reset/refresh (v1 e v2) sobrevivem a restart e
  valem para múltiplas instâncias; fail-open com log se o DB cair.

### Corrigido (bugs que quebravam banco novo, achados por testes)

- Trigger `sincronizar_chave_pix()` referenciava coluna inexistente — QUALQUER
  cadastro de chave PIX falhava em bancos criados pelas migrations.
- `reservas.id_pagamento` (gravada pelo fluxo de pagamento) não tinha migration.
- `estacionamentoPaymentConfigService` usava `data_atualizacao` em
  `estacionamentos` (a tabela usa `updated_at`).
- **Corrida de vaga**: `criarReservaComPagamento` não marcava a vaga como
  `reservada` — ficava `livre` durante o pagamento e outro usuário podia
  ocupá-la. Agora reserva atômica na mesma transação; corrida → 409.

### Adicionado

- Testes de integração da criação de reserva+PIX (BR Code EMV com CRC válido,
  persistência, corrida, rollback). Suíte: 66 → 76 testes.
- Husky + lint-staged no pre-commit (ESLint + Prettier nos staged).
- Página 500 customizada (browser) e banner de `?email_verificado=` na landing.
- `.github/CODEOWNERS`.

### Alterado

- GitHub Actions atualizadas (checkout/setup-node v6, CodeQL v4 — a v2 está
  descontinuada —, codecov v6, create-pull-request v8); Node 22 na matriz do CI.
- Deploy sem `FLY_API_TOKEN` agora é PULADO com aviso explicativo.
- README sem seções obsoletas (TODO antigo, placeholders, instruções
  divergentes de migration).

## [2.1.0] - 2026-06-10 — Auditoria completa & hardening

### Segurança

- **Credenciais**: senha PostgreSQL hardcoded removida de 5 scripts (fallback
  eliminado; `PG_PASSWORD` obrigatória). ⚠️ A senha exposta deve ser rotacionada.
- **PII removida do repositório**: `bd/backup.sql` (continha nome, e-mail, CPF,
  telefone e hash de senha de usuários reais) e fotos de perfil commitadas em
  `uploads/` e `public/user/img/profile/`. `.gitignore` atualizado. ⚠️ Se o
  repositório for público, reescreva o histórico (`git filter-repo`).
- **Uploads sensíveis não são mais públicos**: comprovantes PIX e fotos de
  perfil saem do static e são servidos por endpoints autenticados com checagem
  de ownership (`GET /api/admin/pagamentos/:id/comprovante`,
  `GET /api/user/profile/foto`). Fotos de perfil agora persistem no volume.
- **Fail-closed**: `CRON_API_KEY` sem fallback (503 se ausente, comparação em
  tempo constante, só via header); `JWT_SECRET`/`JWT_REFRESH_SECRET` ausentes
  são erro fatal em produção; corrigido bypass `undefined !== undefined` no
  endpoint de cron legado.
- **Cookies**: política unificada (`sameSite=lax` sempre; `server.js` e
  `config/` divergiam em direções opostas).
- **XSS**: valores dinâmicos escapados em todos os sinks `innerHTML`/`.html()`
  do frontend (incl. contexto JS de handlers `onclick` via `jsArg`); CSP sem
  wildcards `ws://*`/`http:`.
- Rate limiting adicionado: verify-email, ações admin de pagamento, upload de
  comprovante e rotas de auth da API v2 (não tinham nenhum).

### Corrigido

- **Vagas presas para sempre**: nenhuma rotina de expiração liberava a vaga
  (`reserva_id_ativa` só é setado na confirmação). Agora PIX expirado e reserva
  vencida liberam a vaga — com testes de regressão.
- **protectUser vazando**: o mount da rota de comprovante aplicava `protectUser`
  a TODAS as rotas seguintes — `/api/cnpj` e `/api/validate-email` (usadas pelo
  cadastro de admin sem token!), `/api/horarios`, `/api/pix` e `/api/cron`
  respondiam 401 sempre. O cron via HTTP nunca tinha funcionado por isso.
- **Banco novo quebrado**: trigger `log_alteracao_pagamento` referenciava coluna
  renomeada e tabela inexistente (qualquer INSERT em pagamentos falhava);
  tabela `pagamentos` divergia entre a linhagem das migrations e a de produção
  (cada ambiente quebrava em queries diferentes — convergidas com backfill);
  `horarios_funcionamento` não tinha migration; 2 migrations dependiam de ordem
  alfabética e falhavam na 1ª execução. `npm run migrate` em banco limpo agora
  aplica tudo de primeira, sem warnings.
- Schema Zod de `/api/validate-email` explodia (500) sem o campo `options`.
- `responseDateFormatter` era no-op (checava `req.timezone` que ninguém setava)
  e `timezoneUtils` guardava o fuso em variável global (vazava entre
  requisições concorrentes) — removidos; API fala UTC/ISO 8601.
- `models/HorarioFuncionamento.js` era uma fábrica quebrada sobrescrita pelo
  model real — removida (com verificação em runtime).

### Removido (~35 arquivos de código morto verificado)

- Cadeia de webhooks sem consumidor (controller sem rota, service sem uso,
  stubs no-op) e fluxo de confirmação por link de e-mail (quebrado de ponta a
  ponta: `db.Usuario` inexistente, token nunca validava, mount `/api/api/...`).
- `pixService` (Gerencianet), `paymentService`, `redisClient` (100% no-op),
  veículo (rotas nunca montadas), runners de migração legados, scripts .bat
  órfãos, páginas demo/teste expostas, CSS duplicado,
  `notificationService.new.js`, 3 dos 4 módulos de timezone
  (dependência `moment-timezone` removida).

### Adicionado

- Testes de integração contra Postgres real: fluxo PIX manual completo
  (confirmação, BOLA, dupla confirmação, rejeição, expiração + liberação de
  vaga) e fluxo de auth (register/login/refresh/logout); testes do middleware
  de API key. 50 → 66 testes.
- Cache curto (TTL 30s) dos dados do usuário no `protectUser` (elimina 1
  SELECT por requisição autenticada).
- Página 404 customizada + 404 JSON para `/api/*`.
- Migrations: índices `pagamentos.reserva_id` e `reservas(usuario_id,status)`;
  drop das colunas mortas `asaas_*`.
- Fly.io: migrations como `release_command` (abortam o deploy se falharem;
  antes rodavam pós-deploy com `|| true`).

### Alterado

- `contactController` 1711→394 linhas (templates de e-mail extraídos para
  `services/parceriaEmailTemplates.js`).
- Cron: agendador interno chama os serviços diretamente (sem HTTP self-call
  com API key); 5 jobs deduplicados em 3.
- Frontend: `console.log` atrás de flag de debug; bibliotecas deduplicadas em
  `home.html` (jQuery/Bootstrap/Leaflet 2x; Socket.IO em 3 versões diferentes).
- Docs realinhadas ao fluxo atual: `ARQUITETURA_SISTEMA.md` (descrevia gateway
  ASAAS removido), `ROUTES_PAGAMENTO.md`, `GUIA_RAPIDO_PAGAMENTOS.md`,
  `MODELS.md`, swagger; `SECURITY.md` com e-mail de contato real; `README` sem
  referências a arquivos inexistentes.

## [2.0.0] - 2026-05-25 — Always Free

### 🔥 Breaking changes

- **Gateway ASAAS removido completamente**. O sistema agora opera 100% sem
  gateway pago. Recebimento direto via PIX na chave do estacionamento.
- Endpoint `POST /api/webhooks/asaas` foi removido.
- Variáveis de ambiente `ASAAS_*` não são mais lidas.
- Coluna `asaas_wallet_id` em `estacionamentos` é ignorada (não removida — para
  preservar dados; pode ser dropada via migration custom no futuro).

### Adicionado

- **Gerador BR Code PIX local** (`utils/pixBrCode.js`) — segue o padrão EMV/Bacen
  com CRC16-CCITT-FALSE. Sem dependência externa. Coberto por testes unitários.
- **Fluxo de comprovante manual**:
  - `POST /api/reservas/:id/comprovante` (usuário envia foto/PDF do PIX pago)
  - `GET  /api/admin/pagamentos/aguardando-confirmacao` (fila do admin)
  - `POST /api/admin/reservas/:id/confirmar-pagamento` (admin aprova)
  - `POST /api/admin/reservas/:id/rejeitar-pagamento` (admin rejeita c/ motivo)
- Migration `20260525_add_comprovante_pix_manual.sql` adiciona campos:
  `comprovante_url`, `comprovante_enviado_em`, `confirmado_em`,
  `confirmado_por_admin_id`, `rejeitado_em`, `motivo_rejeicao`.
- Notificações Socket.IO em tempo real para admins (`comprovante_pix_recebido`)
  e usuários (`pagamento_confirmado`, `pagamento_rejeitado`).
- Guia de deploy `docs/DEPLOY_ORACLE_FREE_TIER.md` para Oracle Cloud Always Free.
- Documento de fluxo `docs/FLUXO_PIX_MANUAL.md` substitui o antigo `FLUXO_COMPLETO_ASAAS.md`.

### Removido

- `services/asaasMarketplaceService.js`
- `middleware/asaasWebhookAuth.js`
- `routes/estacionamentoAsaasRoutes.js`
- `controllers/estacionamentoAsaasController.js`
- `scripts/conectar-estacionamento-asaas.js`
- `tests/unit/asaasWebhookAuth.test.js`
- `docs/FLUXO_COMPLETO_ASAAS.md`
- Arquivos `.backup` / `.jsx.backup` em `public/js/components/`.

### Segurança

- Removidas **credenciais Gmail hardcoded** em `config/index.js` (vazamento
  acidental no histórico anterior). Em produção o envValidator aborta o startup
  sem `EMAIL_USER`/`EMAIL_PASS`.

### Custo

- **Stack 100% always free**: deploy em Oracle Cloud Free Tier (2 ARM VMs, 24GB
  RAM total), Postgres self-hosted, Caddy + Let's Encrypt para HTTPS, Gmail SMTP.
  Custo total: R$ 0,00/mês.

## [1.0.0] - 2025-10-31

### Adicionado

#### Infraestrutura e DevOps

- 🚀 Workflows CI/CD completos com GitHub Actions
- 🔒 Análise de segurança automatizada com CodeQL
- 🤖 Atualização automática de dependências via bot
- 📋 Templates para issues (bug reports e feature requests)
- 📝 Template para pull requests
- 🛡️ Política de segurança (SECURITY.md)
- 🤝 Guia de contribuição (CONTRIBUTING.md)
- 📜 Código de conduta (CODE_OF_CONDUCT.md)
- ⚖️ Licença MIT
- 💰 Configuração de financiamento (FUNDING.yml)
- 🏷️ Tag v1.0.0 do projeto

#### Sistema Core

- ✅ Sistema completo de autenticação com JWT
- 🔐 Refresh tokens em cookies httpOnly
- 🔑 Sistema de recuperação de senha via email
- 👤 Gerenciamento completo de perfil de usuário
- 🗺️ Mapa interativo com Leaflet
- 🚗 Sistema de reservas e ocupação de vagas
- ⏰ Reservas antecipadas com verificação de disponibilidade
- 🔄 Atualizações em tempo real via Socket.IO
- 👨‍💼 Painel administrativo completo
- 💳 Sistema de pagamentos (PIX e Cartão)
- 📊 Sistema de logging com Winston
- 🛡️ Proteções de segurança (helmet, rate limiting)
- ✔️ Validação de chave PIX automática
- ⏲️ Tarefas agendadas com node-cron

#### Banco de Dados

- 🗄️ Migrations completas do PostgreSQL
- 📦 Backups automáticos
- 🔧 Scripts de manutenção

### Segurança

- Implementação de helmet para headers HTTP seguros
- Rate limiting para proteção contra ataques
- Validação de entrada com express-validator
- Proteção CSRF via sameSite cookies
- Hashing de senhas com Argon2id
- Sanitização de dados

### Documentação

- README.md completo com instruções de instalação
- Documentação de APIs
- Guias de email validation e password reset
- Documentação Swagger (em desenvolvimento)

[1.0.0]: https://github.com/ParkNow914/ParkNow/releases/tag/v1.0.0
