# Módulo de Banco de Dados para o Gateway de Pagamentos
# Cria um Autonomous Database (ATP) no Oracle Cloud

# Cria o Autonomous Database
resource "oci_database_autonomous_database" "payment_gateway_db" {
  admin_password           = var.db_admin_password
  compartment_id          = var.compartment_id
  cpu_core_count          = var.db_cpu_core_count
  data_storage_size_in_tb = var.db_storage_size_tb
  db_name                 = var.db_name
  db_version              = "19c"
  display_name            = "${var.project}-${var.environment}-db"
  license_model           = "LICENSE_INCLUDED"
  is_auto_scaling_enabled = false
  is_free_tier            = true
  is_preview_version_with_service_terms_accepted = false
  db_workload             = "OLTP"
  
  # Configurações de rede
  subnet_id               = var.subnet_id
  nsg_ids                 = [oci_core_network_security_group.db_nsg.id]
  private_endpoint_label  = "${var.project}${var.environment}db"
  
  # Configurações de backup
  is_auto_scaling_for_storage_enabled = false
  is_data_guard_enabled              = false
  is_mtls_connection_required        = true
  
  # Configurações de manutenção
  is_refreshable_clone = false
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Cria um Network Security Group para o banco de dados
resource "oci_core_network_security_group" "db_nsg" {
  compartment_id = var.compartment_id
  vcn_id        = var.vcn_id
  display_name  = "${var.project}-${var.environment}-db-nsg"
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Regras de segurança para o NSG do banco de dados
resource "oci_core_network_security_group_security_rule" "db_nsg_rule_egress" {
  network_security_group_id = oci_core_network_security_group.db_nsg.id
  direction                = "EGRESS"
  protocol                 = "6" # TCP
  destination              = "0.0.0.0/0"
  destination_type         = "CIDR_BLOCK"
}

resource "oci_core_network_security_group_security_rule" "db_nsg_rule_ingress" {
  network_security_group_id = oci_core_network_security_group.db_nsg.id
  direction                = "INGRESS"
  protocol                 = "6" # TCP
  source                   = var.allowed_cidr_blocks
  source_type              = "CIDR_BLOCK"
  
  tcp_options {
    destination_port_range {
      min = 1522
      max = 1522
    }
  }
}

# Cria um usuário para a aplicação
resource "oci_database_autonomous_database_wallet" "payment_gateway_wallet" {
  autonomous_database_id = oci_database_autonomous_database.payment_gateway_db.id
  password              = var.db_wallet_password != "" ? var.db_wallet_password : random_password.wallet_password.result
  base64_encode_content = true
}

# Gera uma senha aleatória para a carteira do banco de dados, se não for fornecida
resource "random_password" "wallet_password" {
  length  = 16
  special = true
}

# Outputs
output "autonomous_database_id" {
  description = "OCID do Autonomous Database"
  value       = oci_database_autonomous_database.payment_gateway_db.id
}

output "autonomous_database_connection_strings" {
  description = "Strings de conexão do Autonomous Database"
  value       = oci_database_autonomous_database.payment_gateway_db.connection_strings
}

output "autonomous_database_wallet_content" {
  description = "Conteúdo da carteira do Autonomous Database (base64 encoded)"
  value       = oci_database_autonomous_database_wallet.payment_gateway_wallet.content
  sensitive   = true
}

output "autonomous_database_wallet_password" {
  description = "Senha da carteira do Autonomous Database"
  value       = var.db_wallet_password != "" ? var.db_wallet_password : random_password.wallet_password.result
  sensitive   = true
}

# Variables
variable "compartment_id" {
  description = "OCID do compartimento onde os recursos serão criados"
  type        = string
}

variable "vcn_id" {
  description = "OCID da VCN onde o banco de dados será criado"
  type        = string
}

variable "subnet_id" {
  description = "OCID da sub-rede privada para o banco de dados"
  type        = string
}

variable "db_name" {
  description = "Nome do banco de dados"
  type        = string
  default     = "paymentdb"
}

variable "db_admin_password" {
  description = "Senha do usuário admin do banco de dados"
  type        = string
  sensitive   = true
}

variable "db_wallet_password" {
  description = "Senha para a carteira do banco de dados (opcional, será gerada automaticamente se não fornecida)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "db_cpu_core_count" {
  description = "Número de OCPUs para o banco de dados"
  type        = number
  default     = 1
}

variable "db_storage_size_tb" {
  description = "Tamanho do armazenamento em TB"
  type        = number
  default     = 1
}

variable "allowed_cidr_blocks" {
  description = "Lista de blocos CIDR permitidos para acessar o banco de dados"
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

variable "project" {
  description = "Nome do projeto para tagging"
  type        = string
  default     = "payment-gateway"
}

variable "environment" {
  description = "Ambiente de implantação (ex: dev, staging, prod)"
  type        = string
  default     = "production"
}
