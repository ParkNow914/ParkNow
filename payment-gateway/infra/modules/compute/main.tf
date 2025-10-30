# Módulo de Computação para o Gateway de Pagamentos
# Cria instâncias de computação para executar a aplicação

# Cria um grupo de instâncias
resource "oci_core_instance_configuration" "payment_gateway_instance_config" {
  compartment_id = var.compartment_id
  display_name   = "${var.project}-${var.environment}-instance-config"
  
  instance_details {
    instance_type = "compute"
    
    launch_details {
      compartment_id = var.compartment_id
      shape          = var.shape
      display_name   = "${var.project}-${var.environment}-instance"
      
      # Configurações de forma (shape)
      shape_config {
        ocpus         = var.shape_config.ocpus
        memory_in_gbs = var.shape_config.memory_in_gbs
      }
      
      # Configurações de rede
      create_vnic_details {
        subnet_id        = var.subnet_id
        assign_public_ip = true
        nsg_ids         = [oci_core_network_security_group.instance_nsg.id]
      }
      
      # Imagem do sistema operacional
      source_details {
        source_type = "image"
        image_id    = data.oci_core_images.oracle_linux_images.images[0].id
      }
      
      # Configurações de inicialização
      metadata = {
        ssh_authorized_keys = var.ssh_public_key
        user_data          = base64encode(templatefile("${path.module}/user_data.sh", {
          db_connection_string = var.db_connection_string
          db_wallet_content    = var.db_wallet_content
          db_wallet_password   = var.db_wallet_password
          project              = var.project
          environment          = var.environment
        }))
      }
      
      # Configurações de armazenamento
      agent_config {
        are_all_plugins_disabled = false
        is_management_disabled   = false
        is_monitoring_disabled   = false
        
        plugins_config {
          desired_state = "ENABLED"
          name          = "Bastion"
        }
      }
      
      # Configurações de inicialização
      availability_config {
        recovery_action = "RESTORE_INSTANCE"
      }
      
      # Configurações de inicialização
      launch_options {
        boot_volume_type                    = "PARAVIRTUALIZED"
        firmware                            = "UEFI_64"
        is_consistent_volume_naming_enabled = true
        network_type                        = "PARAVIRTUALIZED"
        remote_data_volume_type             = "PARAVIRTUALIZED"
      }
    }
  }
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Cria um grupo de instâncias
resource "oci_core_instance_pool" "payment_gateway_instance_pool" {
  compartment_id            = var.compartment_id
  instance_configuration_id = oci_core_instance_configuration.payment_gateway_instance_config.id
  size                      = var.instance_count
  display_name              = "${var.project}-${var.environment}-instance-pool"
  
  placement_configurations {
    availability_domain = data.oci_identity_availability_domain.ad.name
    primary_subnet_id   = var.subnet_id
  }
  
  load_balancers {
    load_balancer_id = var.load_balancer_id
    backend_set_name = var.backend_set_name
    port             = 3000
    vnic_selection   = "PrimaryVnic"
  }
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
  
  lifecycle {
    ignore_changes = [load_balancers]
  }
}

# Cria um Network Security Group para as instâncias
resource "oci_core_network_security_group" "instance_nsg" {
  compartment_id = var.compartment_id
  vcn_id         = var.vcn_id
  display_name   = "${var.project}-${var.environment}-instance-nsg"
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Regras de segurança para o NSG das instâncias
resource "oci_core_network_security_group_security_rule" "instance_nsg_egress" {
  network_security_group_id = oci_core_network_security_group.instance_nsg.id
  direction                = "EGRESS"
  protocol                 = "all"
  destination              = "0.0.0.0/0"
  destination_type         = "CIDR_BLOCK"
}

resource "oci_core_network_security_group_security_rule" "instance_nsg_ingress_http" {
  network_security_group_id = oci_core_network_security_group.instance_nsg.id
  direction                = "INGRESS"
  protocol                 = "6" # TCP
  source                   = var.allowed_cidr_blocks
  source_type              = "CIDR_BLOCK"
  
  tcp_options {
    destination_port_range {
      min = 3000
      max = 3000
    }
  }
}

resource "oci_core_network_security_group_security_rule" "instance_nsg_ingress_ssh" {
  network_security_group_id = oci_core_network_security_group.instance_nsg.id
  direction                = "INGRESS"
  protocol                 = "6" # TCP
  source                   = var.allowed_ssh_ips
  source_type              = "CIDR_BLOCK"
  
  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}

# Obtém a lista de imagens do Oracle Linux
data "oci_core_images" "oracle_linux_images" {
  compartment_id           = var.compartment_id
  operating_system         = "Oracle Linux"
  operating_system_version = "8"
  shape                   = var.shape
  sort_by                 = "TIMECREATED"
  sort_order              = "DESC"
}

# Obtém o domínio de disponibilidade
data "oci_identity_availability_domain" "ad" {
  compartment_id = var.tenancy_ocid
  ad_number      = 1
}

# Outputs
output "instance_pool_id" {
  description = "OCID do pool de instâncias"
  value       = oci_core_instance_pool.payment_gateway_instance_pool.id
}

output "instance_configuration_id" {
  description = "OCID da configuração de instância"
  value       = oci_core_instance_configuration.payment_gateway_instance_config.id
}

# Variables
variable "compartment_id" {
  description = "OCID do compartimento onde os recursos serão criados"
  type        = string
}

variable "vcn_id" {
  description = "OCID da VCN onde as instâncias serão criadas"
  type        = string
}

variable "subnet_id" {
  description = "OCID da sub-rede para as instâncias"
  type        = string
}

variable "load_balancer_id" {
  description = "OCID do Load Balancer"
  type        = string
}

variable "backend_set_name" {
  description = "Nome do backend set no Load Balancer"
  type        = string
}

variable "db_connection_string" {
  description = "String de conexão com o banco de dados"
  type        = string
}

variable "db_wallet_content" {
  description = "Conteúdo da carteira do banco de dados (base64 encoded)"
  type        = string
}

variable "db_wallet_password" {
  description = "Senha da carteira do banco de dados"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "Chave pública SSH para acesso às instâncias"
  type        = string
}

variable "shape" {
  description = "Forma (shape) das instâncias"
  type        = string
  default     = "VM.Standard.E2.1.Micro"
}

variable "shape_config" {
  description = "Configurações detalhadas da forma (shape) das instâncias"
  type = object({
    ocpus         = number
    memory_in_gbs = number
  })
  
  default = {
    ocpus         = 1
    memory_in_gbs = 1
  }
}

variable "instance_count" {
  description = "Número de instâncias no pool"
  type        = number
  default     = 1
}

variable "allowed_cidr_blocks" {
  description = "Lista de blocos CIDR permitidos para acessar as instâncias"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "allowed_ssh_ips" {
  description = "Lista de IPs permitidos para acesso SSH"
  type        = list(string)
  default     = ["0.0.0.0/0"]
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

variable "tenancy_ocid" {
  description = "OCID do tenancy"
  type        = string
}
