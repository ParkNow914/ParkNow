# 🚀 Deploy do ParkNow no Oracle Cloud Free Tier (Always Free)

Esta é a forma recomendada para rodar o ParkNow **100% gratuita e sem expiração**.
O Oracle Cloud Free Tier oferece o melhor tier gratuito do mercado:

- **2 VMs ARM Ampere A1** (até 4 OCPU + 24 GB RAM no total entre elas)
- **200 GB** de armazenamento em block volumes
- **10 TB / mês** de tráfego de saída
- **Sempre grátis** (não expira após 30 dias como AWS/GCP)

Cabe folgadamente: aplicação Node + PostgreSQL + Caddy (HTTPS automático) numa única VM.

---

## 📋 Pré-requisitos

- Cartão de crédito internacional (Oracle valida com R$ 1, **não cobra**)
- Domínio próprio **ou** subdomínio gratuito do [DuckDNS](https://www.duckdns.org/)
- ~30 minutos

---

## 1️⃣ Criar conta Oracle Cloud

1. Acesse https://www.oracle.com/cloud/free/
2. Cadastre-se. Selecione **"Always Free"** explicitamente.
3. Confirme cartão e telefone. Aguarde aprovação (alguns minutos a algumas horas).
4. Na console, escolha uma **home region** próxima (ex: `sa-saopaulo-1`).

---

## 2️⃣ Provisionar a VM (Compute Instance)

1. Console → **Compute** → **Instances** → **Create Instance**.
2. Configure:
   - **Name**: `parknow-prod`
   - **Image**: Canonical Ubuntu 22.04 (ARM)
   - **Shape**: `VM.Standard.A1.Flex` — ajuste para **4 OCPUs / 24 GB RAM** (tudo dentro do free tier)
   - **Networking**: VCN nova com subnet pública
   - **SSH key**: cole sua chave pública (`~/.ssh/id_ed25519.pub`) ou baixe a gerada
   - **Boot volume**: 100 GB (dentro dos 200 GB grátis)
3. Crie. Aguarde ~2 min até ficar **Running**.
4. Anote o **IP público**.

### Abrir portas no firewall (Security List)

Na console: **Networking → VCN → Security Lists → Default**. Adicione **Ingress Rules**:

| Source CIDR | Protocol | Port | Descrição |
|---|---|---|---|
| 0.0.0.0/0 | TCP | 80   | HTTP (Caddy → redirect para HTTPS) |
| 0.0.0.0/0 | TCP | 443  | HTTPS |
| 0.0.0.0/0 | TCP | 22   | SSH (já existe) |

**Importante**: o Ubuntu também tem `iptables` próprio:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## 3️⃣ Configurar DNS

### Opção A — Domínio próprio
Aponte um registro `A` do seu domínio (ex: `parknow.exemplo.com.br`) para o IP público da VM.

### Opção B — Subdomínio gratuito (DuckDNS)
1. Acesse https://www.duckdns.org/ (login com GitHub/Google)
2. Crie um subdomínio: `meuparking.duckdns.org`
3. Coloque o IP da VM no campo "current ip" e salve

Pode levar ~5 min para propagar.

---

## 4️⃣ Instalar dependências na VM

```bash
ssh ubuntu@SEU_IP_PUBLICO

sudo apt update && sudo apt upgrade -y

# Docker + Docker Compose
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker

# Git (caso precise puxar dependências)
sudo apt install -y git
```

Faça logout/login para o `docker` rodar sem `sudo`.

---

## 5️⃣ Clonar e configurar o ParkNow

```bash
cd ~
git clone https://github.com/ParkNow914/ParkNow.git parknow
cd parknow
cp .env.example .env

# Gere segredos fortes (≥ 32 chars)
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env

# Edite o restante (DB, EMAIL, FRONTEND_URL, etc.)
nano .env
```

Pontos importantes em `.env`:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://meuparking.duckdns.org
FRONTEND_URL=https://meuparking.duckdns.org

PG_HOST=db
PG_USER=postgres
PG_PASSWORD=<uma_senha_forte>
PG_DATABASE=parknow_db

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=<senha-de-app-do-google>
EMAIL_FROM="ParkNow <seu-email@gmail.com>"
```

> **Senha de app do Google**: https://myaccount.google.com/apppasswords (2FA precisa estar ativo).

---

## 6️⃣ Subir o stack com Docker Compose

O repo já vem com `docker-compose.yml` (app + Postgres). Vamos só adicionar
o Caddy na frente para HTTPS automático com Let's Encrypt.

Crie `docker-compose.prod.yml` ao lado do `docker-compose.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    container_name: parknow-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app

volumes:
  caddy_data:
  caddy_config:
```

E um `Caddyfile`:

```caddyfile
meuparking.duckdns.org {
    encode zstd gzip
    reverse_proxy app:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

Substitua `meuparking.duckdns.org` pelo seu hostname real.

Suba:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f app
```

O Caddy obtém o certificado Let's Encrypt automaticamente no primeiro acesso HTTPS.

---

## 7️⃣ Rodar as migrations

```bash
docker compose exec db psql -U postgres -d parknow_db -f /docker-entrypoint-initdb.d/create-postgres-tables.sql
# Aplique todas as migrations da pasta migrations/ em ordem
for f in $(ls -1 migrations/*.sql | sort); do
    docker compose exec -T db psql -U postgres -d parknow_db < "$f" || true
done
```

A migration `20260525_add_comprovante_pix_manual.sql` adiciona os campos do
fluxo PIX manual.

---

## 8️⃣ Configurar backup do banco

Free tier inclui 200 GB de Block Volume. Crie um script de backup:

```bash
cat > ~/backup-parknow.sh <<'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/backups
mkdir -p "$BACKUP_DIR"
docker compose -f ~/parknow/docker-compose.yml exec -T db \
    pg_dump -U postgres parknow_db | gzip > "$BACKUP_DIR/parknow_$DATE.sql.gz"
# Mantém últimos 30 dias
find "$BACKUP_DIR" -name "parknow_*.sql.gz" -mtime +30 -delete
EOF
chmod +x ~/backup-parknow.sh

# Cron diário às 4h
( crontab -l 2>/dev/null; echo "0 4 * * * ~/backup-parknow.sh" ) | crontab -
```

Para backup off-site grátis, use **Backblaze B2** (10 GB free) ou
**Cloudflare R2** (10 GB free) via `rclone`.

---

## 9️⃣ Monitoramento (opcional, free)

| Ferramenta | Tier free |
|---|---|
| **UptimeRobot** | 50 monitors free, check a cada 5 min — aponte para `https://seu-host/health` |
| **Better Stack** | 1 GB logs/mês |
| **Sentry** | 5k erros/mês — basta setar `SENTRY_DSN` no `.env` |
| **Grafana Cloud** | 50 GB logs, 10k metrics — `prom-client` já está integrado |

A stack do diretório `monitoring/` (Prometheus + Grafana + Alertmanager)
roda local, sem custo, se você quiser self-hosted.

---

## 🔁 Atualizações futuras

```bash
cd ~/parknow
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# Aplicar novas migrations:
for f in $(ls -1 migrations/*.sql | sort); do
    docker compose exec -T db psql -U postgres -d parknow_db < "$f" || true
done
```

---

## 💰 Custo total

| Item | Custo |
|---|---|
| Oracle Cloud VM (4 OCPU / 24 GB RAM, 100 GB disk) | **R$ 0** (always free) |
| PostgreSQL self-hosted no Docker | **R$ 0** |
| Caddy + Let's Encrypt SSL | **R$ 0** |
| DuckDNS (subdomínio) | **R$ 0** |
| Gmail SMTP (500 emails/dia) | **R$ 0** |
| OpenStreetMap (mapas) | **R$ 0** |
| Brasil API (validação CNPJ) | **R$ 0** |
| Pagamentos PIX (manual) | **R$ 0** (sem gateway) |
| **TOTAL MENSAL** | **R$ 0,00** |

---

## ⚠️ Limites do tier grátis para ficar atento

- **Tráfego saída**: 10 TB/mês (mais que suficiente para um app pequeno-médio)
- **Block Volume**: 200 GB total (somando boot + dados)
- **Inatividade**: VM pode ser **reclamada** se ficar idle por meses. Mantenha o app rodando + monitoramento ativo.
- **Capacity outs**: às vezes a região não tem capacidade A1 disponível. Tente outra região ou tente novamente em algumas horas.

---

## 🆘 Troubleshooting rápido

| Sintoma | Causa provável |
|---|---|
| `Cannot connect to db:5432` | Postgres ainda subindo. Aguarde 30s e tente `docker compose logs db`. |
| Caddy retorna 502 | App ainda subindo ou crashou. `docker compose logs app`. |
| Let's Encrypt retorna `failed to obtain certificate` | DNS ainda não propagou. Aguarde 10 min e reinicie o Caddy. |
| Login do admin falhando | Provavelmente segredo JWT < 32 chars. Em produção o startup aborta. |
| `/metrics` retorna 404 em produção | Esperado — só funciona via loopback ou com `METRICS_TOKEN` no header. |
