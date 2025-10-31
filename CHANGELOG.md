# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
