# 🗺️ ParkNow — Roadmap (always free)

Documento de controle do trabalho contínuo. **Todos os itens são gratuitos**
(puro código/config); os poucos com custo potencial têm alternativa free marcada.

**Convenção:** `[ ]` pendente · `[x]` feito · `[~]` em progresso
**Prioridade:** 🔴 crítico · 🟡 importante · 🟢 melhoria

> A cada sessão concluída: `lint` + `test` + commit + deploy + atualizar este arquivo.

---

## 📌 Sessões concluídas

### Sessão 1 — Fundação confiável ✅ _(commit d934067, deploy OK)_

- [x] Sistema de migrations real (`schema_migrations` + runner idempotente, denylist de obsoletas)
- [x] `console.log` crítico de runtime → limpo (paymentRoutes, responseDateFormatter) + regra ESLint no-console
- [x] Sentry ativável (errorTracker já pronto; basta `SENTRY_DSN` + `@sentry/node`)
- [x] CI com Postgres real + migrate + coverage (Node 20)
- [x] Deploy automático Fly (`deploy.yml` — requer secret `FLY_API_TOKEN`)
- [~] Persistir aprovações de parceria no Postgres → **movido para Sessão 2** (precisa refatorar callers async com cuidado)
- [~] Limpeza completa dos 113 `console.log` restantes → contínuo (warnings no lint)

### Sessão 2 — Segurança & persistência ✅ _(commit 3bc8c88, deploy OK)_

- [x] tempStorage (aprovações) → Postgres (async + fallback memória)
- [x] Idempotency → Postgres (`PostgresIdempotencyStore`, seleção automática)
- [x] Verificação de email no cadastro (token 24h + `/api/auth/verify-email/:token`)
- [x] Testes da persistência S2 (idempotency store + validação) — rodam no CI com Postgres
- [~] Rate limiting → Postgres → **movido para Sessão 3** (in-memory ok para 1 instância Fly hoje)
- [x] Bug fix: validação de `numeroVagas` (range 1..1000) — regressão pega por teste

### Sessão 3 — Auditoria completa & hardening ✅ _(sessão Claude, 2026-06-10)_

- [x] **Segurança crítica**: senha PG hardcoded removida de 5 scripts (⚠️ ROTACIONAR a senha real); dump com PII (CPF/telefone/hash) e fotos de usuários removidos do repo + .gitignore (⚠️ reescrever histórico Git se o repo for público); CRON_API_KEY fail-closed; JWT fatal em produção sem segredo; cookies unificados (lax)
- [x] **Uploads protegidos**: comprovantes e fotos de perfil fora do static; endpoints autenticados com ownership (GET /api/admin/pagamentos/:id/comprovante, GET /api/user/profile/foto); fotos de perfil salvas em volume persistente
- [x] **Bugs graves**: vagas presas em 'reservada' para sempre na expiração (liberadas agora); trigger quebrado em pagamentos (INSERT falhava em banco novo); drift pagamentos/horarios_funcionamento entre linhagens de schema; protectUser vazando para metade da API (cnpj/validate-email/cron sempre 401); Zod options sem default (500 no validate-email); migrations agora aplicam 100% limpas em banco novo
- [x] **Código morto**: ~35 arquivos (webhooks sem rota, fluxo PIX por link de e-mail quebrado, modelos/middlewares/utils órfãos, páginas demo, CSS duplicado, notificationService.new.js, Redis no-op)
- [x] **Testes**: fluxo PIX manual completo (BOLA, dupla confirmação, expiração + liberação de vaga) e auth (register/login/refresh/logout) contra Postgres real
- [x] **Refatoração**: contactController 1711→394 linhas (templates extraídos); cron sem HTTP self-call e sem jobs duplicados; timezone 4 módulos→1; cache de auth (1 SELECT/req a menos)
- [x] **Frontend**: XSS sinks escapados (incl. contexto JS em onclick); console.log atrás de flag; jQuery/Bootstrap/Leaflet/Socket.IO deduplicados (3 versões de socket.io!)
- [x] Índices faltantes; colunas asaas\_\* dropadas; migrations de pagamentos convergidas; página 404; release_command no Fly; docs realinhadas (ARQUITETURA, ROUTES_PAGAMENTO, GUIA)

### Sessão 3 — Frontend/UX & rate limit _(planejada — itens restantes)_

- [x] Rate limiting → Postgres _(Sessão 4)_
- [x] Eliminar `notificationService.new.js` _(Sessão 3)_
- [ ] Modo escuro · Filtros no mapa · Páginas 404/500 · Preview de comprovante
- [x] Feedback visual de `?email_verificado=` na landing _(Sessão 4)_

---

## 🔴 CRÍTICO

### Testes & Qualidade

- [x] Testes de integração do fluxo PIX (comprovante→confirmação/rejeição/expiração) _(Sessão 3)_
- [~] Testes dos controllers — auth e pagamento feitos _(Sessão 3)_; reserva/admin pendentes
- [x] CI rodando contra Postgres real _(Sessão 1)_
- [x] Coverage como gate no CI _(Sessão 1)_
- [ ] Teste do BR Code contra apps de banco reais

### Segurança

- [x] Verificação de email no cadastro _(Sessão 2)_
- [x] `tempStorage` (aprovações) → Postgres _(Sessão 2)_
- [x] Idempotency → Postgres _(Sessão 2)_
- [x] Rate limiting → Postgres _(Sessão 4)_
- [ ] Remover `unsafe-inline` da CSP (nonce nos scripts)
- [x] Validar magic bytes + stripar EXIF no upload de comprovante _(Sessão 4)_
- [ ] 2FA opcional para admins (TOTP)
- [ ] Auditar logs para não gravar PII (CPF/senha)

### Pagamento PIX

- [ ] Valor declarado + checklist na confirmação do admin
- [x] Hash anti-duplicação de comprovante (SHA-256 + 409 em reuso) _(Sessão 4)_
- [ ] Countdown de expiração no modal PIX (frontend)
- [ ] Webhook PIX nativo de banco grátis (Inter/Sicoob/BB) — opcional, confirmação automática

---

## 🟡 IMPORTANTE

### Backend / API

- [ ] Unificar camada de dados (pg vs Sequelize — 3 modelos de usuário hoje)
- [ ] Versionar API de verdade (deprecar v1, consolidar v2)
- [ ] Paginação consistente (envelope padrão)
- [ ] Padronizar respostas de erro/sucesso
- [ ] `/health/ready` checar disco/uploads + memória
- [ ] Soft-delete + auditoria em reservas/pagamentos
- [ ] Export de dados do usuário (LGPD)

### Banco de Dados

- [x] Migrations reais com tabela de controle _(Sessão 1)_
- [x] Consolidar migrations — aplicam limpas em banco novo na 1ª execução _(Sessão 3)_
- [x] Índices faltando (`pagamentos.reserva_id`, `reservas.usuario_id+status`) _(Sessão 3)_
- [x] Dropar colunas mortas asaas*\* *(Sessão 3)\_
- [ ] Constraints (CHECK valor>0, FK ON DELETE explícito)
- [ ] Restore-drill de backup + off-site grátis (R2/B2)

### Frontend / UX

- [x] Eliminar `notificationService.new.js` _(Sessão 3)_
- [ ] Reduzir peso do front (React UMD + jQuery + Bootstrap juntos)
- [ ] Modo escuro
- [ ] Filtros de busca no mapa (preço, distância, coberto, aberto agora)
- [ ] Estados loading/empty/erro consistentes
- [ ] Preview de imagem antes do upload do comprovante
- [x] Páginas 404/500 customizadas _(Sessões 3-4)_
- [ ] Onboarding/tour

### Observabilidade

- [~] Remover 124 `console.log` → logger _(Sessão 1: runtime files)_
- [~] Sentry _(Sessão 1)_
- [ ] Dashboards Grafana prontos
- [ ] Regras de alerta úteis (`alert.rules`)
- [ ] UptimeRobot em `/health`
- [ ] Métricas de negócio no `/metrics`

---

## 🟢 MELHORIAS & TECH DEBT

### Refatoração

- [~] Quebrar god files — contactController 1711→394 _(Sessão 3)_; admin script 1449 pendente
- [x] Remover dead code (pixService Gerencianet, Redis, webhooks, +30 arquivos) _(Sessão 3)_
- [ ] Resolver `@deprecated` (AppError, userModel)
- [ ] TypeScript ou JSDoc + checkJs
- [ ] Padronizar idioma do código
- [x] Husky + lint-staged no pre-commit _(Sessão 4)_

### Performance

- [ ] Otimizar imagens (WebP/AVIF via sharp)
- [ ] Cache de geocoding (CEP→lat/long) no Postgres
- [ ] Lazy-load do mapa Leaflet
- [ ] HTTP caching headers + ETag
- [ ] Confirmar compression ativo
- [ ] CDN grátis (Cloudflare na frente do Fly)

### Acessibilidade & i18n

- [ ] Auditoria WCAG AA nas telas internas
- [ ] ARIA consistente em user/admin
- [ ] i18n pt-BR/en/es

---

## ✨ FEATURES NOVAS

### Motoristas

- [ ] Avaliações e notas de estacionamentos
- [ ] Favoritos (ícone existe, feature incompleta)
- [ ] Múltiplos veículos por conta
- [ ] Recibo em PDF
- [ ] Check-in/out via QR Code no local
- [ ] Web Push notifications
- [ ] Compartilhar reserva / .ics

### Estacionamentos

- [ ] Dashboard de receita com gráficos (Chart.js)
- [ ] Preços dinâmicos por horário/dia
- [ ] Múltiplos operadores (RBAC com papéis)
- [ ] Relatório fiscal / export CSV expandido
- [ ] Bloqueio de vagas para manutenção

### Plataforma

- [ ] PWA (manifest + service worker)
- [ ] Painel super-admin (ParkNow)
- [ ] Sistema de cupons

---

## ⚖️ COMPLIANCE / LEGAL (LGPD)

- [ ] Política de privacidade real
- [ ] Banner de consentimento de cookies
- [ ] Export + exclusão de dados do usuário
- [ ] Termos de uso
- [ ] Política de retenção de dados

---

## 🚀 DEVOPS / INFRA

- [x] CI deploy automático no merge da main _(Sessão 1)_
- [ ] Ambiente de staging (segundo app Fly)
- [ ] Confirmar Dependabot mergeando
- [ ] Revisar auto-stop vs min_machines_running
- [ ] DNS resiliente (fly.dev como fallback documentado)

---

## 📄 DOCUMENTAÇÃO

- [ ] OpenAPI 100% dos endpoints
- [ ] Atualizar ARQUITETURA_SISTEMA.md (remover menções ASAAS/split)
- [ ] Guia de setup local passo a passo
- [ ] Runbook de incidentes

---

## Histórico de deploys

| Sessão | Commit  | Data       | Foco                                                                                |
| ------ | ------- | ---------- | ----------------------------------------------------------------------------------- |
| 1      | d934067 | 2026-05-28 | Fundação: migrations reais, CI com Postgres, deploy automático, higiene de logs     |
| 2      | 3bc8c88 | 2026-05-29 | Segurança & persistência: tempStorage/idempotency no Postgres, verificação de email |
