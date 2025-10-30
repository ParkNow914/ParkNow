# Sistema de Validação de E-mail

Este documento descreve o sistema de validação de e-mail implementado no projeto ParkNow, incluindo suas funcionalidades, configuração e uso.

## Visão Geral

O sistema de validação de e-mail fornece uma solução abrangente para validação de endereços de e-mail, incluindo:

- Validação de sintaxe
- Verificação de domínio (MX e registros DNS)
- Detecção de e-mails descartáveis/temporários
- Detecção de domínios grátis
- Cache de resultados para melhor desempenho
- Rate limiting para evitar abuso
- Suporte a validação em lote
- Compressão de respostas

## Componentes Principais

### 1. Serviço de Cache de Domínio (`domainCacheService.js`)

Gerencia o cache de resultados de validação de domínios para melhorar o desempenho.

### 2. Serviço de Validação MX (`mxValidationService.js`)

Responsável por validar os registros MX de um domínio.

### 3. Análise de Domínio (`domainAnalysisService.js`)

Fornece análise detalhada de domínios, incluindo detecção de:
- E-mails descartáveis
- Domínios grátis
- Padrões suspeitos
- Pontuação de risco

### 4. Rate Limiter (`emailRateLimiter.js`)

Implementa limites de taxa para prevenir abuso da API de validação.

### 5. Rotas de API (`emailValidationRoutes.js`)

Endpoints da API para validação de e-mails:
- `POST /api/email/validate` - Valida um único e-mail
- `POST /api/email/validate/batch` - Valida múltiplos e-mails em lote

## Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```
# Configuração do Redis para rate limiting
REDIS_HOST=localhost
REDIS_PORT=6379

# Configuração de cache
DOMAIN_CACHE_TTL=86400 # 24 horas em segundos

# Configuração de validação MX
MX_VALIDATION_TIMEOUT=5000 # tempo limite em ms
MX_MIN_PRIORITY=100 # prioridade máxima aceitável para servidores MX
```

### Dependências

Certifique-se de ter o Redis instalado e em execução para o rate limiting e cache distribuído.

## Uso

### Validação de E-mail Único

**Requisição:**
```http
POST /api/email/validate
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "options": {
    "allowDisposable": false,
    "allowFree": true,
    "validateMx": true,
    "validateSmtp": false
  }
}
```

**Resposta de Sucesso (200 OK):**
```json
{
  "valid": true,
  "message": "E-mail válido",
  "domain": "exemplo.com",
  "isDisposable": false,
  "isFree": false,
  "isSuspicious": false,
  "riskScore": 0,
  "mxRecords": [
    {
      "exchange": "mx1.exemplo.com",
      "priority": 10
    }
  ],
  "timestamp": "2023-10-01T12:00:00.000Z",
  "cached": false,
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Validação em Lote

**Requisição:**
```http
POST /api/email/validate/batch
Content-Type: application/json

{
  "emails": ["usuario1@exemplo.com", "usuario2@exemplo.com"],
  "options": {
    "allowDisposable": false,
    "allowFree": true
  }
}
```

**Resposta de Sucesso (200 OK):**
```json
{
  "success": true,
  "count": 2,
  "valid": 2,
  "invalid": 0,
  "results": [
    {
      "valid": true,
      "email": "usuario1@exemplo.com",
      "domain": "exemplo.com",
      "isDisposable": false,
      "isFree": false,
      "isSuspicious": false,
      "riskScore": 0
    },
    {
      "valid": true,
      "email": "usuario2@exemplo.com",
      "domain": "exemplo.com",
      "isDisposable": false,
      "isFree": false,
      "isSuspicious": false,
      "riskScore": 0
    }
  ]
}
```

## Testes

O sistema inclui testes automatizados que podem ser executados com os seguintes comandos:

```bash
# Executar todos os testes
npm test

# Executar apenas os testes de validação de e-mail
npm run test:email

# Executar testes em modo watch
npm run test:watch

# Gerar relatório de cobertura
npm run test:coverage
```

## Monitoramento e Logs

O sistema registra eventos importantes usando o Winston. Os logs incluem:

- Tentativas de validação
- Erros de validação
- Problemas de conexão
- Eventos de cache
- Violações de rate limiting

## Segurança

- **Rate Limiting**: Limita o número de requisições por IP e por e-mail
- **Validação de Entrada**: Usa express-validator e Zod para validação rigorosa
- **Sanitização**: Remove caracteres potencialmente perigosos
- **Respostas Genéricas**: Evita vazamento de informações sensíveis em mensagens de erro
- **Tempo de Resposta Consistente**: Prevenção de ataques de timing

## Melhorias Futuras

- Integração com serviços de validação de e-mail de terceiros
- Verificação SMTP em tempo real
- Dashboard de monitoramento
- Análise de padrões de uso para detecção de abuso
- Suporte a mais listas de domínios descartáveis
- Cache distribuído com invalidação inteligente
