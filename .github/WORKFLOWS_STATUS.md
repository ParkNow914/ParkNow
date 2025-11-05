# Status dos Workflows

Este documento rastreia o status dos diferentes workflows de CI/CD do projeto.

## Workflows Ativos

### ✅ Validação Básica
**Arquivo:** `.github/workflows/validate.yml`
**Executa em:** Push e PR na branch `main`
**Propósito:** Validação rápida de sintaxe e estrutura do projeto

**Checks realizados:**
- Sintaxe JavaScript do arquivo principal
- Estrutura de diretórios do projeto
- Listagem de dependências
- Vulnerabilidades críticas

---

### 🔄 CI/CD Pipeline
**Arquivo:** `.github/workflows/ci.yml`
**Executa em:** Push e PR nas branches `main` e `develop`
**Propósito:** Testes completos, segurança e build

**Jobs:**
- **test**: Testa em Node.js 18.x e 20.x
- **security**: Auditoria de segurança e Snyk scan
- **build**: Build do projeto

**Configurações:**
- `fail-fast: false` - Continua testando outras versões mesmo se uma falhar
- `continue-on-error: true` - Testes opcionais não bloqueiam o pipeline

---

### 🔒 CodeQL Analysis
**Arquivo:** `.github/workflows/codeql.yml`
**Executa em:**
- Push e PR na branch `main`
- Semanalmente (segundas às 00:00 UTC)

**Propósito:** Análise de segurança e qualidade de código

**Configurações:**
- Timeout: 15 minutos
- Queries: security-and-quality

---

### 🤖 Dependency Update
**Arquivo:** `.github/workflows/dependency-update.yml`
**Executa em:**
- Semanalmente (domingos às 00:00 UTC)
- Manualmente via workflow_dispatch

**Propósito:** Mantém dependências atualizadas automaticamente

---

## Como Interpretar os Resultados

### ✅ Sucesso
Todos os checks passaram. O código está pronto para merge/deploy.

### ⚠️ Warnings
Alguns checks opcionais falharam, mas não bloqueiam o pipeline.
- Linting pode ter avisos não-críticos
- Testes podem estar incompletos
- Auditoria de segurança pode ter vulnerabilidades de baixa severidade

### ❌ Falha
Checks críticos falharam:
- Sintaxe JavaScript inválida
- Instalação de dependências falhou
- Vulnerabilidades críticas encontradas

---

## Manutenção

### Adicionar novo workflow
1. Criar arquivo em `.github/workflows/`
2. Seguir o padrão YAML do GitHub Actions
3. Testar localmente quando possível
4. Documentar aqui

### Desabilitar workflow temporariamente
Adicionar ao início do arquivo:
```yaml
on:
  workflow_dispatch:  # Apenas manual
```

### Debug de workflows
- Ver logs em: Actions → Nome do workflow → Job específico
- Adicionar step de debug:
```yaml
- name: Debug info
  run: |
    echo "Node version: $(node -v)"
    echo "NPM version: $(npm -v)"
    pwd
    ls -la
```

---

## Badges para README

```markdown
[![CI/CD](https://github.com/ParkNow914/ParkNow/actions/workflows/ci.yml/badge.svg)](https://github.com/ParkNow914/ParkNow/actions/workflows/ci.yml)
[![Validação](https://github.com/ParkNow914/ParkNow/actions/workflows/validate.yml/badge.svg)](https://github.com/ParkNow914/ParkNow/actions/workflows/validate.yml)
[![CodeQL](https://github.com/ParkNow914/ParkNow/actions/workflows/codeql.yml/badge.svg)](https://github.com/ParkNow914/ParkNow/actions/workflows/codeql.yml)
```
