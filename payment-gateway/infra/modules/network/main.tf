# Módulo de Rede para o Gateway de Pagamentos
# Cria VCN, Subnets, Internet Gateway, Route Tables, Security Groups, etc.

# Cria a VCN (Virtual Cloud Network)
resource "oci_core_vcn" "payment_gateway_vcn" {
  cidr_block     = var.vcn_cidr_block
  compartment_id = var.compartment_id
  display_name   = "${var.project}-${var.environment}-vcn"
  dns_label      = "${var.project}${var.environment}"
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Cria a Subnet Pública
resource "oci_core_subnet" "public_subnet" {
  cidr_block        = var.public_subnet_cidr_block
  compartment_id    = var.compartment_id
  vcn_id            = oci_core_vcn.payment_gateway_vcn.id
  display_name      = "${var.project}-${var.environment}-public-subnet"
  dns_label         = "public"
  
  # Habilita o endereço IP público para instâncias na sub-rede
  prohibit_public_ip_on_vnic = false
  
  # Habilita o DHCP para atribuição de nomes DNS
  dhcp_options_id    = oci_core_vcn.payment_gateway_vcn.default_dhcp_options_id
  route_table_id     = oci_core_route_table.public_route_table.id
  security_list_ids  = [oci_core_security_list.public_security_list.id]
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Cria o Internet Gateway
resource "oci_core_internet_gateway" "internet_gateway" {
  compartment_id = var.compartment_id
  vcn_id        = oci_core_vcn.payment_gateway_vcn.id
  display_name  = "${var.project}-${var.environment}-igw"
  enabled       = true
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Cria a Tabela de Rotas Pública
resource "oci_core_route_table" "public_route_table" {
  compartment_id = var.compartment_id
  vcn_id        = oci_core_vcn.payment_gateway_vcn.id
  display_name  = "${var.project}-${var.environment}-public-rt"
  
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.internet_gateway.id
  }
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Cria a Lista de Segurança Pública
resource "oci_core_security_list" "public_security_list" {
  compartment_id = var.compartment_id
  vcn_id        = oci_core_vcn.payment_gateway_vcn.id
  display_name  = "${var.project}-${var.environment}-public-sl"
  
  # Tráfego de saída permitido
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }
  
  # Tráfego de entrada permitido
  # HTTP
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    
    tcp_options {
      min = 80
      max = 80
    }
  }
  
  # HTTPS
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    
    tcp_options {
      min = 443
      max = 443
    }
  }
  
  # SSH
  ingress_security_rules {
    protocol  = "6" # TCP
    source    = var.allowed_ssh_ips
    
    tcp_options {
      min = 22
      max = 22
    }
  }
  
  # Aplicação Node.js
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    
    tcp_options {
      min = 3000
      max = 3000
    }
  }
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Outputs
output "vcn_id" {
  description = "OCID da VCN criada"
  value       = oci_core_vcn.payment_gateway_vcn.id
}

output "public_subnet_id" {
  description = "OCID da Subnet Pública"
  value       = oci_core_subnet.public_subnet.id
}

output "public_security_list_id" {
  description = "OCID da Lista de Segurança Pública"
  value       = oci_core_security_list.public_security_list.id
}
