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

### Sessão 3 — Frontend/UX & rate limit _(planejada)_
- [ ] Rate limiting → Postgres
- [ ] Eliminar `notificationService.new.js` (duplicado)
- [ ] Modo escuro · Filtros no mapa · Páginas 404/500 · Preview de comprovante
- [ ] Feedback visual de `?email_verificado=` na landing

---

## 🔴 CRÍTICO

### Testes & Qualidade
- [ ] Testes de integração do fluxo PIX (reserva→BR Code→comprovante→confirmação)
- [ ] Testes dos controllers (auth, reserva, pagamento, admin)
- [x] CI rodando contra Postgres real _(Sessão 1)_
- [x] Coverage como gate no CI _(Sessão 1)_
- [ ] Teste do BR Code contra apps de banco reais

### Segurança
- [x] Verificação de email no cadastro _(Sessão 2)_
- [x] `tempStorage` (aprovações) → Postgres _(Sessão 2)_
- [x] Idempotency → Postgres _(Sessão 2)_
- [ ] Rate limiting → Postgres (hoje em memória) _(Sessão 3)_
- [ ] Remover `unsafe-inline` da CSP (nonce nos scripts)
- [ ] Validar magic bytes + stripar EXIF no upload de comprovante
- [ ] 2FA opcional para admins (TOTP)
- [ ] Auditar logs para não gravar PII (CPF/senha)

### Pagamento PIX
- [ ] Valor declarado + checklist na confirmação do admin
- [ ] Hash anti-duplicação de comprovante
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
- [ ] Consolidar migrations conflitantes num baseline limpo
- [ ] Índices faltando (`pagamentos.reserva_id`, `reservas.usuario_id+status`, etc)
- [ ] Dropar colunas mortas (asaas_*, stripe_*)
- [ ] Constraints (CHECK valor>0, FK ON DELETE explícito)
- [ ] Restore-drill de backup + off-site grátis (R2/B2)

### Frontend / UX
- [ ] Eliminar `notificationService.new.js` (duplicado)
- [ ] Reduzir peso do front (React UMD + jQuery + Bootstrap juntos)
- [ ] Modo escuro
- [ ] Filtros de busca no mapa (preço, distância, coberto, aberto agora)
- [ ] Estados loading/empty/erro consistentes
- [ ] Preview de imagem antes do upload do comprovante
- [ ] Páginas 404/500 customizadas
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
- [ ] Quebrar god files (contactController 1711 linhas, admin script 1449)
- [ ] Remover dead code (pixService Gerencianet, Redis comentado)
- [ ] Resolver `@deprecated` (AppError, userModel)
- [ ] TypeScript ou JSDoc + checkJs
- [ ] Padronizar idioma do código
- [ ] Husky + lint-staged no pre-commit

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
| Sessão | Commit | Data | Foco |
|---|---|---|---|
| 1 | d934067 | 2026-05-28 | Fundação: migrations reais, CI com Postgres, deploy automático, higiene de logs |
| 2 | 3bc8c88 | 2026-05-29 | Segurança & persistência: tempStorage/idempotency no Postgres, verificação de email |
