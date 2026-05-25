#!/usr/bin/env bash
#
# bootstrap-oracle.sh
# -------------------
# Provisiona o ParkNow em uma VM Ubuntu 22.04 nova do Oracle Cloud Free Tier.
# Instala Docker + Docker Compose, clona o repo, configura .env, sobe o stack
# (Postgres + App + Caddy com HTTPS automático) e aplica todas as migrations.
#
# Pré-requisitos antes de rodar este script (você precisa fazer manualmente):
#   1. Criar a VM no Oracle Cloud (VM.Standard.A1.Flex, Ubuntu 22.04)
#   2. Liberar portas 80, 443 e 22 na Security List da VCN
#   3. Apontar um domínio/subdomínio (ex: parknow.duckdns.org) para o IP da VM
#   4. SSH na VM como `ubuntu`
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/ParkNow914/ParkNow/main/scripts/bootstrap-oracle.sh \
#     | DOMAIN=parknow.duckdns.org EMAIL_USER=foo@gmail.com EMAIL_PASS=senha bash
#
# Variáveis aceitas (via env):
#   DOMAIN       (obrigatório) — hostname público da aplicação
#   EMAIL_USER   (obrigatório) — usuário SMTP (ex: foo@gmail.com)
#   EMAIL_PASS   (obrigatório) — senha de app SMTP
#   EMAIL_FROM   (opcional)    — default: "ParkNow <$EMAIL_USER>"
#   REPO_URL     (opcional)    — default: https://github.com/ParkNow914/ParkNow.git
#   APP_DIR      (opcional)    — default: $HOME/parknow
#   PG_PASSWORD  (opcional)    — gerada aleatoriamente se não definida

set -euo pipefail

############################################
# 0. Pré-validações
############################################
if [[ $EUID -eq 0 ]]; then
    echo "❌ Não rode como root. Use o usuário 'ubuntu' (com sudo)."
    exit 1
fi
if [[ "${DOMAIN:-}" == "" ]]; then
    echo "❌ Defina a variável DOMAIN (ex: DOMAIN=parknow.duckdns.org)."
    exit 1
fi
if [[ "${EMAIL_USER:-}" == "" || "${EMAIL_PASS:-}" == "" ]]; then
    echo "❌ Defina EMAIL_USER e EMAIL_PASS (Gmail aceita senha de app)."
    exit 1
fi

REPO_URL="${REPO_URL:-https://github.com/ParkNow914/ParkNow.git}"
APP_DIR="${APP_DIR:-$HOME/parknow}"
EMAIL_FROM="${EMAIL_FROM:-ParkNow <$EMAIL_USER>}"
PG_PASSWORD="${PG_PASSWORD:-$(openssl rand -hex 16)}"

log() { echo -e "\033[1;34m[bootstrap]\033[0m $*"; }

############################################
# 1. Sistema atualizado + ferramentas básicas
############################################
log "Atualizando sistema..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y curl ca-certificates gnupg lsb-release git openssl ufw iptables-persistent

############################################
# 2. Firewall (libera 80/443/22)
############################################
log "Configurando firewall do Ubuntu..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
sudo netfilter-persistent save || true

############################################
# 3. Docker + Compose
############################################
if ! command -v docker >/dev/null 2>&1; then
    log "Instalando Docker..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    ARCH=$(dpkg --print-architecture)
    echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
                            docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
fi
DOCKER="sudo docker"        # roda com sudo dentro do script (sem precisar relogar)
COMPOSE="$DOCKER compose"

############################################
# 4. Clone do repo
############################################
if [[ -d "$APP_DIR/.git" ]]; then
    log "Repo já existe em $APP_DIR, atualizando..."
    git -C "$APP_DIR" fetch --quiet
    git -C "$APP_DIR" pull --rebase --quiet
else
    log "Clonando $REPO_URL em $APP_DIR..."
    git clone --quiet "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

############################################
# 5. .env
############################################
if [[ ! -f .env ]]; then
    log "Gerando .env..."
    cp .env.example .env
fi

# Gera segredos fortes se faltam
ensure_secret() {
    local var="$1"
    if ! grep -q "^${var}=" .env || grep -q "^${var}=changeme" .env; then
        local val
        val=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null \
              || openssl rand -hex 32)
        # remove linhas antigas e adiciona nova
        sed -i "/^${var}=/d" .env
        echo "${var}=${val}" >> .env
    fi
}

# Atualiza/insere uma chave de forma idempotente
set_env() {
    local key="$1" val="$2"
    sed -i "/^${key}=/d" .env
    echo "${key}=${val}" >> .env
}

ensure_secret JWT_SECRET
ensure_secret JWT_REFRESH_SECRET
ensure_secret SESSION_SECRET
ensure_secret CRON_API_KEY

set_env NODE_ENV       production
set_env PORT           3000
set_env APP_URL        "https://${DOMAIN}"
set_env BASE_URL       "https://${DOMAIN}"
set_env FRONTEND_URL   "https://${DOMAIN}"
set_env CORS_ORIGIN    "https://${DOMAIN}"
set_env TRUST_PROXY    "1"
set_env TZ             "America/Sao_Paulo"

set_env PG_HOST        db
set_env PG_PORT        5432
set_env PG_USER        postgres
set_env PG_PASSWORD    "${PG_PASSWORD}"
set_env PG_DATABASE    parknow_db

set_env EMAIL_HOST     smtp.gmail.com
set_env EMAIL_PORT     587
set_env EMAIL_USER     "${EMAIL_USER}"
set_env EMAIL_PASS     "${EMAIL_PASS}"
set_env EMAIL_FROM     "${EMAIL_FROM}"
set_env EMAIL_SUPPORT  "${EMAIL_USER}"
set_env EMAIL_ADMIN    "${EMAIL_USER}"

############################################
# 6. Caddy (HTTPS automático via Let's Encrypt)
############################################
log "Configurando Caddy + docker-compose.prod.yml..."

cat > Caddyfile <<EOF
${DOMAIN} {
    encode zstd gzip
    reverse_proxy app:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
EOF

cat > docker-compose.prod.yml <<'EOF'
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
EOF

############################################
# 7. Build + up
############################################
log "Construindo imagens..."
$COMPOSE -f docker-compose.yml -f docker-compose.prod.yml build

log "Subindo serviços..."
$COMPOSE -f docker-compose.yml -f docker-compose.prod.yml up -d

# Espera o Postgres ficar saudável
log "Aguardando Postgres ficar pronto..."
for i in {1..30}; do
    if $COMPOSE exec -T db pg_isready -U postgres -d parknow_db >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

############################################
# 8. Migrations
############################################
log "Aplicando schema base..."
if [[ -f scripts/create-postgres-tables.sql ]]; then
    $COMPOSE exec -T db psql -U postgres -d parknow_db < scripts/create-postgres-tables.sql || true
fi

log "Aplicando migrations incrementais..."
for f in $(ls -1 migrations/*.sql 2>/dev/null | sort); do
    log "  → $f"
    $COMPOSE exec -T db psql -U postgres -d parknow_db < "$f" || true
done

############################################
# 9. Backup diário
############################################
log "Agendando backup diário (04:00)..."
mkdir -p "$HOME/backups"

cat > "$HOME/backup-parknow.sh" <<'BAK'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$HOME/backups"
sudo docker compose -f "$HOME/parknow/docker-compose.yml" -f "$HOME/parknow/docker-compose.prod.yml" \
    exec -T db pg_dump -U postgres parknow_db | gzip > "$HOME/backups/parknow_$DATE.sql.gz"
find "$HOME/backups" -name "parknow_*.sql.gz" -mtime +30 -delete
BAK
chmod +x "$HOME/backup-parknow.sh"

( crontab -l 2>/dev/null | grep -v backup-parknow.sh; echo "0 4 * * * $HOME/backup-parknow.sh" ) | crontab -

############################################
# 10. Saída
############################################
log "✅ Pronto!"
echo
echo "🌐  Acesse: https://${DOMAIN}"
echo "📂  Repo:   $APP_DIR"
echo "🔑  Postgres senha gerada: ${PG_PASSWORD}  (salva no .env)"
echo
echo "Comandos úteis:"
echo "  cd $APP_DIR"
echo "  sudo docker compose logs -f app"
echo "  sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml restart"
echo "  ./backup-parknow.sh   # backup manual"
echo
echo "Custo mensal: R\$ 0,00 (Oracle Cloud Always Free + Let's Encrypt + Gmail SMTP)."
