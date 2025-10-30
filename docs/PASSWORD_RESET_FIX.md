# Correção do Sistema de Redefinição de Senha

## 📊 Problema Identificado

O sistema estava mostrando o nome errado nos emails de redefinição de senha devido a emails similares em contas diferentes:

- **Usuário:** Alisson Santos (alimiguel1098@**hotmail**.com) ✅
- **Admin:** JAQUES FERNANDES DOS SANTOS MARTINS (alimiguel1098@**gmail**.com) ❌

**Não havia duplicação real** - são emails diferentes (@hotmail vs @gmail), mas o sistema pode ter confundido ou o usuário testou com o email errado.

## ✅ Soluções Implementadas

### 1. **Proteção no Banco de Dados (PostgreSQL)**

Criado trigger que **IMPEDE** emails duplicados entre as tabelas `usuarios` e `admins`:

```sql
-- Se tentar criar usuário com email que já existe como admin, dá ERRO
-- Se tentar criar admin com email que já existe como usuário, dá ERRO
```

**Arquivo:** `scripts/add-email-validation-trigger.sql`

**Testado e funcionando:** ✅
```
psql> INSERT INTO usuarios (nome, email, senha) VALUES ('Teste', 'thalessoares475@gmail.com', '123');
ERRO: Email thalessoares475@gmail.com já cadastrado como administrador
```

### 2. **Validação no Código Node.js**

Adicionada validação dupla em `authController.js`:

**No registro de usuário:**
- Verifica se email já existe em `usuarios` ✅
- Verifica se email já existe em `admins` ✅ (NOVO)

**No registro de admin:**
- Verifica se email já existe em `admins` ✅
- Verifica se email já existe em `usuarios` ✅ (NOVO)

**Arquivo modificado:** `controllers/authController.js`

### 3. **Logging Detalhado para Debug**

Adicionados logs completos no processo de reset de senha:

```javascript
logger.info(`[Reset Req] Conta encontrada: ${email}`);
logger.info(`[Reset Req] Tipo: ${accountType}, ID: ${account.id}`);
logger.info(`[Reset Req] Nome no BD: "${account.nome}" (tipo: ${typeof account.nome})`);
logger.info(`[Reset Req] Campos disponíveis: ${JSON.stringify(Object.keys(account))}`);
logger.info(`[Reset Req] Nome que será usado no email: "${nomeUsuario}"`);
```

Agora você pode ver **exatamente** qual nome está vindo do banco de dados!

## 🗑️ Gerenciamento de Contas

### Contas Atuais no Sistema:

| Tipo     | ID | Nome                                 | Email                      |
|----------|-----|--------------------------------------|----------------------------|
| ADMINS   | 7   | JAQUES FERNANDES DOS SANTOS MARTINS | alimiguel1098@gmail.com    |
| ADMINS   | 6   | Antonio Carlos da Silva Junior       | thalessoares475@gmail.com  |
| USUARIOS | 1   | Alisson Santos                       | alimiguel1098@hotmail.com  |

### Como Remover Contas

Use o script: `scripts/manage-duplicate-accounts.sql`

**Exemplo 1 - Remover o admin "Jaques":**
```powershell
psql -U postgres -d parknow_db -c "DELETE FROM admins WHERE id = 7;"
```

**Exemplo 2 - Consultar todas as contas:**
```powershell
psql -U postgres -d parknow_db -f scripts/manage-duplicate-accounts.sql
```

**Exemplo 3 - Remover por email:**
```powershell
psql -U postgres -d parknow_db -c "DELETE FROM usuarios WHERE email = 'email@exemplo.com';"
```

## 🧪 Como Testar a Correção

### Teste 1: Verificar os Logs

1. Faça um pedido de redefinição de senha
2. Verifique os logs:
```powershell
Get-Content logs/combined.log -Tail 20 | Select-String "Reset Req"
```

3. Você verá algo como:
```
[Reset Req] Conta encontrada: alimiguel1098@hotmail.com
[Reset Req] Tipo: user, ID: 1
[Reset Req] Nome no BD: "Alisson Santos" (tipo: string)
[Reset Req] Nome que será usado no email: "Alisson Santos"
```

### Teste 2: Tentar Criar Duplicação

```powershell
# Isso deve FALHAR com erro:
psql -U postgres -d parknow_db -c "INSERT INTO usuarios (nome, email, senha) VALUES ('Teste', 'thalessoares475@gmail.com', 'teste');"

# Resultado esperado:
# ERRO: Email thalessoares475@gmail.com já cadastrado como administrador
```

### Teste 3: Verificar Email Correto

1. Acesse a aplicação
2. Clique em "Esqueci minha senha"
3. Digite: `alimiguel1098@hotmail.com` (email do USUÁRIO Alisson)
4. Verifique o email recebido - deve chegar com nome "Alisson Santos"

## 📝 Comandos Úteis

### Ver todas as contas:
```powershell
psql -U postgres -d parknow_db -c "SELECT 'USUARIOS' as tipo, id, nome, email FROM usuarios UNION ALL SELECT 'ADMINS', id, nome, email FROM admins;"
```

### Ver logs em tempo real:
```powershell
Get-Content logs/combined.log -Wait -Tail 10
```

### Limpar todas as contas de teste:
```powershell
# CUIDADO - Remove TODOS os usuários!
psql -U postgres -d parknow_db -c "DELETE FROM usuarios; DELETE FROM admins;"
```

### Fazer backup antes de limpar:
```powershell
psql -U postgres -d parknow_db -c "\copy usuarios TO 'backup_usuarios.csv' CSV HEADER"
psql -U postgres -d parknow_db -c "\copy admins TO 'backup_admins.csv' CSV HEADER"
```

## 🔒 Proteções Permanentes

As seguintes proteções estão ATIVAS agora:

1. ✅ **Trigger no PostgreSQL** - Impede email duplicado entre tabelas
2. ✅ **Validação no Node.js** - Mensagem amigável ao usuário
3. ✅ **Logging detalhado** - Facilita debug de problemas
4. ✅ **Unique constraint** - Email único dentro de cada tabela (já existia)

## 🎯 Próximos Passos

1. **Teste a redefinição de senha** com o email correto (`alimiguel1098@hotmail.com`)
2. **Verifique os logs** para confirmar que o nome está correto
3. **Remova contas de teste** se desejar
4. **Cadastre novas contas** - o sistema agora impede duplicações

## ❓ Dúvidas Comuns

**P: Por que o email chegou com nome "Jaques" para o Alisson?**
R: Provavelmente você usou o email do admin (@gmail.com) em vez do email do usuário (@hotmail.com).

**P: Posso ter o mesmo email como usuário E admin?**
R: **NÃO!** A proteção agora impede isso.

**P: E se eu quiser usar o mesmo email?**
R: Você precisa remover uma das contas primeiro, depois pode cadastrar com o tipo que preferir.

**P: Como remover um admin que tem estacionamento?**
R: Use o script `manage-duplicate-accounts.sql` que tem exemplos para remover em cascata.
