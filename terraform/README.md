# 🚀 Provisionamento Automatizado — Oracle Cloud Free Tier

Este diretório contém o módulo Terraform que cria toda a infra para rodar o
ParkNow em uma VM Oracle Cloud **Always Free** (R$ 0/mês, sem expirar).

**Em 1 comando** (`terraform apply`) você ganha:

- VCN + Internet Gateway + Route Table + Security List (22/80/443) + Subnet pública
- VM `VM.Standard.A1.Flex` com **4 OCPU + 24 GB RAM** (Ubuntu 22.04 ARM)
- Boot volume 50 GB
- Cloud-init que automaticamente instala Docker + Caddy (HTTPS) + clona o repo
  + sobe Postgres + App + aplica migrations + agenda backup diário

Suas credenciais OCI **nunca saem da sua máquina** — ficam no `~/.oci/config`
local e em `terraform.tfvars` (este último está no `.gitignore`).

---

## 📋 Pré-requisitos

1. **Conta Oracle Cloud Always Free** já criada e aprovada — https://www.oracle.com/cloud/free/
2. **Terraform ≥ 1.6** instalado:
   - Windows: `winget install Hashicorp.Terraform` ou `choco install terraform`
   - macOS: `brew install terraform`
   - Linux: https://developer.hashicorp.com/terraform/install
3. **OCI CLI** (opcional mas recomendado, para gerar a API key facilmente):
   - https://docs.oracle.com/iaas/Content/API/SDKDocs/cliinstall.htm
4. **Chave SSH** — se você ainda não tem:
   ```bash
   ssh-keygen -t ed25519 -C "parknow"
   # Aceite os defaults (~/.ssh/id_ed25519)
   ```

---

## 🔑 Gerar credenciais OCI (uma vez só)

### Opção A — Pelo OCI CLI (mais rápido)

```bash
oci setup config
```

O wizard cria automaticamente:
- `~/.oci/config` com tenancy/user/region/fingerprint
- `~/.oci/oci_api_key.pem` (chave privada)
- Pergunta se quer fazer upload da chave pública para o console (responda `y`)

Depois pega os valores:

```bash
grep -E '^(tenancy|user|fingerprint|key_file|region)' ~/.oci/config
```

### Opção B — Manual pelo console web

1. Login em https://cloud.oracle.com
2. Canto superior direito → **Profile** → **User Settings**
3. Em **API Keys** → **Add API Key**
4. Marque "Generate API Key Pair" → **Download Private Key** → **Add**
5. O console mostra uma "Configuration File Preview" — copie os valores
   (`tenancy`, `user`, `fingerprint`, `region`) para o `terraform.tfvars`
6. Salve a chave privada baixada em `~/.oci/oci_api_key.pem` (chmod 600)

---

## 📝 Configurar o `terraform.tfvars`

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edite `terraform.tfvars` com os valores reais:

```hcl
tenancy_ocid     = "ocid1.tenancy.oc1..xxx..."
user_ocid        = "ocid1.user.oc1..xxx..."
fingerprint      = "aa:bb:cc:dd:..."
private_key_path = "C:/Users/SEU_USUARIO/.oci/oci_api_key.pem"
region           = "sa-saopaulo-1"
compartment_ocid = "ocid1.tenancy.oc1..xxx..."   # mesmo do tenancy_ocid se não tem compartments separados

ssh_public_key_path = "C:/Users/SEU_USUARIO/.ssh/id_ed25519.pub"

domain     = "parknow.duckdns.org"   # crie em https://duckdns.org (grátis)
email_user = "voce@gmail.com"
email_pass = "senha-de-app-do-gmail"  # https://myaccount.google.com/apppasswords
```

**⚠️ NUNCA commite o `terraform.tfvars`** — o `.gitignore` deste diretório já bloqueia.

---

## 🚀 Provisionar (3 comandos)

```bash
cd terraform

# 1) Baixa o provider OCI (~30 MB)
terraform init

# 2) Mostra o que VAI ser criado (review)
terraform plan

# 3) Cria de fato (~3 min para criar a VM)
terraform apply
# Digite "yes" quando perguntar
```

Saída esperada ao final:

```
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.

Outputs:

app_url            = "https://parknow.duckdns.org"
instance_id        = "ocid1.instance.oc1.sa-saopaulo-1.xxx..."
instance_public_ip = "150.230.45.123"
ssh_command        = "ssh ubuntu@150.230.45.123"
next_steps         = <<EOT
    ╔══════════════════════════════════════════════════════════════════════╗
    ║                  VM provisionada! Próximos passos:                   ║
    ...
```

---

## 🌐 Pós-deploy (5 minutos)

1. **Aponte o DNS** do seu domínio para o IP retornado:
   - DuckDNS: https://www.duckdns.org → cole o IP no campo do subdomínio
   - Domínio próprio: crie um registro `A` apontando para o IP
2. **Aguarde o cloud-init** terminar (instala Docker, sobe containers, etc.):
   ```bash
   terraform output -raw ssh_command   # mostra o comando ssh
   ssh ubuntu@<IP>
   sudo tail -f /var/log/parknow-bootstrap.log
   # Quando vir "✅ Pronto!" no log, está terminado.
   ```
3. **Acesse** `https://parknow.duckdns.org` — Caddy emite o certificado
   Let's Encrypt no primeiro acesso HTTPS.

---

## 🧰 Comandos úteis

```bash
# Status atual
terraform show

# Ver só o IP público
terraform output -raw instance_public_ip

# Atualizar (após editar variables/tfvars)
terraform apply

# DESTRUIR tudo (VM + VCN + tudo). Cobra R$ 0 mesmo se ficar rodando, mas
# se quiser limpar para refazer:
terraform destroy
```

---

## 🆘 Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| `Error: 400-LimitExceeded` ao criar instance | Já bateu o limite de ARM A1 no tenancy | Destruir VMs ARM antigas ou usar outra região |
| `Out of host capacity` | A região não tem A1 disponível agora | Tente novamente em 1–6 h ou troque `region` |
| `Error: 401-NotAuthenticated` | Fingerprint não bate com a key | Confirme que `private_key_path` aponta para a `.pem` que casa com o fingerprint no console |
| `apply` aparenta congelar em "Still creating..." | Normal — instance leva ~90 s, depois cloud-init leva ~3 min | Aguarde até 5 min |
| Não consigo abrir o site após DNS apontar | DNS ainda propagando | `dig +short parknow.duckdns.org` deve retornar o IP. Aguarde 5–15 min |
| `tls: handshake failure` | Caddy ainda não emitiu o cert | Aguarde 1–2 min após o primeiro acesso na porta 443 |

Para inspecionar a VM:

```bash
ssh ubuntu@<IP>
cd /home/ubuntu/parknow
sudo docker compose ps               # status dos containers
sudo docker compose logs -f app      # logs da app
sudo docker compose logs -f caddy    # logs do Caddy / TLS
```

---

## 💰 Custo

| Item | Custo |
|---|---|
| VM A1.Flex (4 OCPU, 24 GB RAM) | R$ 0 (always free) |
| Boot volume 50 GB | R$ 0 (até 200 GB free) |
| VCN, IGW, route table, security list, subnet | R$ 0 |
| IP público | R$ 0 |
| Tráfego saída | R$ 0 (até 10 TB/mês) |
| Postgres self-hosted + Caddy + Gmail SMTP | R$ 0 |
| **TOTAL** | **R$ 0,00/mês — para sempre** |
