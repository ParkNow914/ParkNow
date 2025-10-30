# Módulo de Armazenamento para o Gateway de Pagamentos
# Cria buckets no Object Storage para armazenar backups, logs e arquivos estáticos

# Cria um bucket para backups do banco de dados
resource "oci_objectstorage_bucket" "backup_bucket" {
  compartment_id = var.compartment_id
  name           = "${var.project}-${var.environment}-backups-${random_id.bucket_suffix.hex}"
  namespace      = data.oci_objectstorage_namespace.tenancy_namespace.namespace
  access_type    = "NoPublicAccess"
  storage_tier  = "Standard"
  versioning    = "Enabled"
  
  # Política de retenção de 90 dias
  retention_rules {
    display_name = "90-day-retention-rule"
    duration {
      time_amount = 90
      time_unit   = "DAYS"
    }
    time_rule_locked = null
  }
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "database-backups"
  }
}

# Cria um bucket para armazenar arquivos estáticos
resource "oci_objectstorage_bucket" "static_files_bucket" {
  compartment_id = var.compartment_id
  name           = "${var.project}-${var.environment}-static-${random_id.bucket_suffix.hex}"
  namespace      = data.oci_objectstorage_namespace.tenancy_namespace.namespace
  access_type    = "ObjectRead"
  storage_tier  = "Standard"
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "static-files"
  }
}

# Cria um bucket para armazenar logs da aplicação
resource "oci_objectstorage_bucket" "logs_bucket" {
  compartment_id = var.compartment_id
  name           = "${var.project}-${var.environment}-logs-${random_id.bucket_suffix.hex}"
  namespace      = data.oci_objectstorage_namespace.tenancy_namespace.namespace
  access_type    = "NoPublicAccess"
  storage_tier  = "Standard"
  
  # Política de retenção de 365 dias
  retention_rules {
    display_name = "365-day-retention-rule"
    duration {
      time_amount = 365
      time_unit   = "DAYS"
    }
    time_rule_locked = null
  }
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "application-logs"
  }
}

# Gera um sufixo aleatório para os nomes dos buckets
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Obtém o namespace do tenant
# Obtém o namespace do tenant
data "oci_objectstorage_namespace" "tenancy_namespace" {}

# Outputs
output "backup_bucket_name" {
  description = "Nome do bucket de backups"
  value       = oci_objectstorage_bucket.backup_bucket.name
}

output "static_files_bucket_name" {
  description = "Nome do bucket de arquivos estáticos"
  value       = oci_objectstorage_bucket.static_files_bucket.name
}

output "logs_bucket_name" {
  description = "Nome do bucket de logs"
  value       = oci_objectstorage_bucket.logs_bucket.name
}

output "namespace" {
  description = "Namespace do Object Storage"
  value       = data.oci_objectstorage_namespace.tenancy_namespace.namespace
}

# Variables
variable "compartment_id" {
  description = "OCID do compartimento onde os recursos serão criados"
  type        = string
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
