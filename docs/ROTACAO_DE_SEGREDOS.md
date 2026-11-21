# Rotação de segredos (incidente C-06 da auditoria de 2026-11-20)

O repositório é público e o histórico do Git contém, nos commits `2b2d2c8`,
`492014e`, `17ed8df` (arquivo `.env`) e `89e360d` (`bd/backup_20251111_152349.sql`):

| Segredo                                                              | Onde trocar                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `EMAIL_PASS` / `EMAIL_PASSWORD` (senha de app do Gmail)              | Conta Google → Segurança → Senhas de app → revogar a antiga e gerar outra |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`                 | Gerar novos (comando abaixo) e gravar no Fly                              |
| `PG_PASSWORD` (e o dump com hashes de senha)                         | Trocar a senha do usuário do banco                                        |
| `MP_ACCESS_TOKEN` (`APP_…`), `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET` | Mercado Pago → Suas integrações → Credenciais → renovar                   |
| `ASAAS_SANDBOX_API_KEY`                                              | Painel ASAAS → Integrações → gerar nova chave                             |
| `scripts/.env` (mesma senha do banco)                                | Coberto pela troca do banco                                               |

**Trocar é o que protege.** Apagar do histórico não desfaz a exposição: o
repositório já foi clonado por quem quis.

## 1. Gerar e aplicar os novos segredos (Fly.io)

```powershell
node -e "for (const k of ['JWT_SECRET','JWT_REFRESH_SECRET','SESSION_SECRET']) console.log(k + '=' + require('crypto').randomBytes(48).toString('hex'))"
```

```powershell
fly secrets set -a parknow-alimi JWT_SECRET=<novo> JWT_REFRESH_SECRET=<novo> SESSION_SECRET=<novo> EMAIL_PASS=<nova senha de app>
```

Trocar os segredos de JWT derruba todas as sessões (todo mundo loga de novo).
Isso é desejado: invalida qualquer token forjado com o segredo vazado.

## 2. Senha do banco

```powershell
fly postgres connect -a parknow-db
```

```sql
ALTER USER postgres WITH PASSWORD '<nova senha forte>';
```

Depois atualize `DATABASE_URL`/`PG_PASSWORD` no app (`fly secrets set`).

## 3. Limpar o histórico (depois de trocar tudo)

Reescreve o histórico e exige force push; combine com quem mais tem clone.

```powershell
pip install git-filter-repo
```

```powershell
git filter-repo --invert-paths --path .env --path scripts/.env --path bd/backup_20251111_152349.sql --path payment-gateway/.env.example
```

```powershell
git push --force --all
```

```powershell
git push --force --tags
```

Peça ao suporte do GitHub para limpar as referências em cache dos commits
antigos (Settings → "Contact support" → remover dados sensíveis).

## 4. Impedir que aconteça de novo

- GitHub → Settings → Code security → ativar **Secret scanning** e **Push protection** (gratuito em repositório público).
- O CI agora roda o gitleaks em todo push (`.github/workflows/ci.yml`, job `secrets`).
- `.env` já está no `.gitignore`; nunca commitar dumps de banco.
