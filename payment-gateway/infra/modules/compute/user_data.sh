#!/bin/bash

# Configuração do sistema operacional
set -e

# Atualiza o sistema
yum update -y

# Instala dependências
yum install -y \
    docker \
    git \
    jq \
    unzip \
    oracle-instantclient19.19-basic-19.19.0.0.0-2.x86_64 \
    oracle-instantclient19.19-sqlplus-19.19.0.0.0-2.x86_64

# Configura o Docker
systemctl enable docker
systemctl start docker

# Cria diretório para a aplicação
mkdir -p /opt/payment-gateway
chmod 755 /opt/payment-gateway

# Configura o Oracle Instant Client
echo 'export LD_LIBRARY_PATH=/usr/lib/oracle/19.19/client64/lib:${LD_LIBRARY_PATH}' >> /etc/bashrc
echo 'export PATH=$PATH:/usr/lib/oracle/19.19/client64/bin' >> /etc/bashrc

# Cria o diretório para o wallet do banco de dados
mkdir -p /opt/oracle/wallet

# Decodifica e extrai o wallet do banco de dados
echo '${db_wallet_content}' | base64 -d > /opt/oracle/wallet/wallet.zip
unzip -o /opt/oracle/wallet/wallet.zip -d /opt/oracle/wallet/
chmod 600 /opt/oracle/wallet/*

# Configura as variáveis de ambiente para o banco de dados
cat > /opt/oracle/wallet/setenv.sh << 'EOF'
#!/bin/bash
export TNS_ADMIN=/opt/oracle/wallet
export LD_LIBRARY_PATH=/usr/lib/oracle/19.19/client64/lib:${LD_LIBRARY_PATH}
export PATH=$PATH:/usr/lib/oracle/19.19/client64/bin
EOF

chmod +x /opt/oracle/wallet/setenv.sh

# Cria o arquivo de configuração da aplicação
cat > /opt/payment-gateway/.env << EOF
# Configuração da aplicação
NODE_ENV=production
PORT=3000

# Configuração do banco de dados
DB_HOST=${db_connection_string}
DB_USER=admin
DB_PASSWORD=${db_wallet_password}
DB_NAME=${db_connection_string}
DB_PORT=1522
DB_SSL=true
DB_REJECT_UNAUTHORIZED=false

# Configuração do Mercado Pago
MP_ACCESS_TOKEN=${MP_ACCESS_TOKEN}
MP_PLATFORM_ACCOUNT_ID=${MP_PLATFORM_ACCOUNT_ID}

# Configuração de segurança
JWT_SECRET=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)

# Configuração do Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Configuração de logs
LOG_LEVEL=info
LOG_FILE=/var/log/payment-gateway/app.log

# Configuração do Object Storage
OCI_BUCKET_NAME=payment-gateway-${environment}
OCI_NAMESPACE=$(oci os ns get --query data --raw-output)

# Configurações de e-mail
SMTP_HOST=smtp.email.oci.oraclecloud.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
EMAIL_FROM=noreply@payment-gateway.example.com

# Outras configurações
PLATFORM_FEE=20
ALLOWED_ORIGINS=https://*.example.com
EOF

# Configura o systemd para a aplicação
cat > /etc/systemd/system/payment-gateway.service << 'EOF'
[Unit]
Description=Payment Gateway Service
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/payment-gateway
EnvironmentFile=/opt/payment-gateway/.env
ExecStartPre=/usr/bin/docker pull ${DOCKER_IMAGE:-payment-gateway:latest}
ExecStart=/usr/bin/docker run --rm \
  --name payment-gateway \
  --env-file /opt/payment-gateway/.env \
  -v /opt/oracle/wallet:/opt/oracle/wallet \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 3000:3000 \
  ${DOCKER_IMAGE:-payment-gateway:latest}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Habilita e inicia o serviço
systemctl daemon-reload
systemctl enable payment-gateway
systemctl start payment-gateway

# Configura o logrotate para os logs da aplicação
cat > /etc/logrotate.d/payment-gateway << 'EOF'
/var/log/payment-gateway/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        systemctl reload payment-gateway > /dev/null 2>&1 || true
    endscript
}
EOF

# Instala o agente de monitoramento do OCI
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)" --accept-all-defaults
echo 'export PATH=$PATH:/root/bin' >> /root/.bashrc

# Configura o agente de monitoramento
cat > /root/.oci/config << EOF
[DEFAULT]
user=${OCI_USER_OCID}
fingerprint=${OCI_FINGERPRINT}
key_file=/root/.oci/oci_api_key.pem
tenancy=${OCI_TENANCY_OCID}
region=${OCI_REGION}
EOF

# Configura a chave da API
mkdir -p /root/.oci
echo '${OCI_API_KEY}' > /root/.oci/oci_api_key.pem
chmod 600 /root/.oci/oci_api_key.pem

# Instala o agente de monitoramento do OCI
yum install -y oracle-cloud-agent
systemctl enable oracle-cloud-agent
systemctl start oracle-cloud-agent

# Configura o agente de monitoramento para coletar métricas
cat > /etc/oracle-cloud-agent/plugins/metrics/config.json << 'EOF'
{
  "compartmentId": "${OCI_COMPARTMENT_OCID}",
  "namespace": "oci_computeagent",
  "metrics": {
    "disk": [
      {
        "name": "DiskBytesRead",
        "dimensions": [{"diskname": "*"}]
      },
      {
        "name": "DiskBytesWritten",
        "dimensions": [{"diskname": "*"}]
      }
    ],
    "memory": [
      {
        "name": "MemoryUtilization"
      },
      {
        "name": "MemoryUsed"
      }
    ],
    "network": [
      {
        "name": "NetworkBytesIn",
        "dimensions": [{"interface": "*"}]
      },
      {
        "name": "NetworkBytesOut",
        "dimensions": [{"interface": "*"}]
      }
    ]
  }
}
EOF

# Reinicia o agente de monitoramento
systemctl restart oracle-cloud-agent

# Configura o firewall
firewall-cmd --permanent --add-port=22/tcp
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --reload

# Configura o timezone
timedatectl set-timezone America/Sao_Paulo

# Configura o NTP
yum install -y chrony
systemctl enable chronyd
systemctl start chronyd

# Limpa o cache do yum
yum clean all
rm -rf /var/cache/yum

# Finaliza o script
echo "Configuração inicial concluída com sucesso em $(date)" >> /var/log/payment-gateway/init.log
