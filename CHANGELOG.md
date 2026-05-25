# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
