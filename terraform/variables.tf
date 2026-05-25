# variables.tf — todas as variáveis de entrada do módulo.
#
# Os valores reais ficam em terraform.tfvars (não versionado).
# Veja terraform.tfvars.example como template.

# ─── Credenciais OCI ────────────────────────────────────────────────────────
# Você pode preencher aqui OU deixar em branco e usar o ~/.oci/config padrão
# (preferido). Se usar o ~/.oci/config, basta passar `region` e o provider
# detecta o resto automaticamente.

variable "tenancy_ocid" {
  type        = string
  description = "OCID da sua tenancy. Encontra em Profile → Tenancy."
}

variable "user_ocid" {
  type        = string
  description = "OCID do seu usuário (Profile → User Settings)."
}

variable "fingerprint" {
  type        = string
  description = "Fingerprint da API key gerada em User Settings → API Keys."
}

variable "private_key_path" {
  type        = string
  description = "Caminho absoluto para a sua chave privada OCI (.pem)."
}

variable "region" {
  type        = string
  description = "Região OCI. Exemplos: sa-saopaulo-1, sa-vinhedo-1, us-ashburn-1."
}

variable "compartment_ocid" {
  type        = string
  description = "Compartment onde criar os recursos. Use o tenancy_ocid se não tiver compartments separados."
}

# ─── SSH ───────────────────────────────────────────────────────────────────
variable "ssh_public_key_path" {
  type        = string
  description = "Caminho para a sua chave SSH PÚBLICA (será injetada na VM)."
  default     = "~/.ssh/id_ed25519.pub"
}

# ─── Recursos ──────────────────────────────────────────────────────────────
variable "name_prefix" {
  type        = string
  description = "Prefixo aplicado aos nomes dos recursos."
  default     = "parknow"
}

variable "instance_shape" {
  type        = string
  description = "Shape da VM. A1.Flex é always free (ARM)."
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  type        = number
  description = "Número de OCPUs (free tier ARM: até 4 OCPUs totais)."
  default     = 4
}

variable "memory_in_gbs" {
  type        = number
  description = "Memória em GB (free tier ARM: até 24 GB totais)."
  default     = 24
}

variable "boot_volume_size_in_gbs" {
  type        = number
  description = "Tamanho do boot volume em GB (free tier: 200 GB total entre todos os volumes)."
  default     = 50
}

# ─── Aplicação (passado para cloud-init) ──────────────────────────────────
variable "domain" {
  type        = string
  description = "Hostname público (ex: parknow.duckdns.org). Aponte o DNS para o IP retornado nos outputs ANTES de acessar via HTTPS."
}

variable "email_user" {
  type        = string
  description = "Conta SMTP para envio de emails transacionais (ex: foo@gmail.com)."
}

variable "email_pass" {
  type        = string
  description = "Senha SMTP (use 'senha de app' do Gmail). NÃO commitar."
  sensitive   = true
}

variable "repo_url" {
  type        = string
  description = "Repositório do ParkNow a ser clonado dentro da VM."
  default     = "https://github.com/ParkNow914/ParkNow.git"
}
