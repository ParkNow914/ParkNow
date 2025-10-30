# Módulo de Load Balancer para o Gateway de Pagamentos
# Cria um Load Balancer com configurações de segurança e roteamento

# Cria o Load Balancer
resource "oci_load_balancer_load_balancer" "payment_gateway_lb" {
  compartment_id = var.compartment_id
  display_name   = "${var.project}-${var.environment}-lb"
  shape          = var.shape
  subnet_ids     = var.subnet_ids
  
  # Configurações de forma (shape)
  shape_details {
    maximum_bandwidth_in_mbps = var.shape_details.maximum_bandwidth_in_mbps
    minimum_bandwidth_in_mbps = var.shape_details.minimum_bandwidth_in_mbps
  }
  
  freeform_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Cria o backend set para as instâncias da aplicação
resource "oci_load_balancer_backend_set" "payment_gateway_backend_set" {
  name             = "${var.project}-${var.environment}-backend-set"
  load_balancer_id = oci_load_balancer_load_balancer.payment_gateway_lb.id
  policy           = "LEAST_CONNECTIONS"
  
  health_checker {
    protocol          = "HTTP"
    port              = 3000
    url_path          = "/health"
    return_code       = 200
    retries           = 3
    timeout_in_millis = 3000
    interval_ms       = 10000
  }
  
  session_persistence_configuration {
    cookie_name      = "*"
    disable_fallback = true
  }
  
  ssl_configuration {
    certificate_name        = oci_load_balancer_certificate.payment_gateway_cert.certificate_name
    verify_peer_certificate = false
  }
}

# Cria o listener HTTPS
resource "oci_load_balancer_listener" "payment_gateway_https_listener" {
  load_balancer_id         = oci_load_balancer_load_balancer.payment_gateway_lb.id
  name                     = "${var.project}-${var.environment}-https-listener"
  default_backend_set_name = oci_load_balancer_backend_set.payment_gateway_backend_set.name
  port                     = 443
  protocol                 = "HTTP"
  
  ssl_configuration {
    certificate_name        = oci_load_balancer_certificate.payment_gateway_cert.certificate_name
    verify_peer_certificate = false
  }
  
  connection_configuration {
    idle_timeout_in_seconds = 300
  }
}

# Cria o listener HTTP com redirecionamento para HTTPS
resource "oci_load_balancer_listener" "payment_gateway_http_listener" {
  load_balancer_id = oci_load_balancer_load_balancer.payment_gateway_lb.id
  name             = "${var.project}-${var.environment}-http-listener"
  default_backend_set_name = "${var.project}-${var.environment}-redirect"
  port             = 80
  protocol         = "HTTP"
}

# Cria um backend set de redirecionamento
resource "oci_load_balancer_backend_set" "redirect_backend_set" {
  name             = "${var.project}-${var.environment}-redirect"
  load_balancer_id = oci_load_balancer_load_balancer.payment_gateway_lb.id
  policy           = "LEAST_CONNECTIONS"
  
  health_checker {
    protocol          = "HTTP"
    port              = 80
    url_path          = "/health"
    return_code       = 200
    retries           = 3
    timeout_in_millis = 3000
    interval_ms       = 10000
  }
}

# Cria uma regra de roteamento para redirecionar HTTP para HTTPS
resource "oci_load_balancer_rule_set" "redirect_http_to_https" {
  load_balancer_id = oci_load_balancer_load_balancer.payment_gateway_lb.id
  name             = "${var.project}-${var.environment}-redirect-http-to-https"
  
  items {
    action = "REDIRECT"
    
    redirect_uri {
      protocol = "https"
      host     = "{host}"
      port     = 443
      path     = "{path}"
      query    = "{query}"
    }
  }
}

# Cria um certificado SSL auto-assinado (substitua por um certificado válido em produção)
resource "tls_private_key" "payment_gateway_key" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "payment_gateway_cert" {
  private_key_pem = tls_private_key.payment_gateway_key.private_key_pem
  
  subject {
    common_name  = "payment-gateway.example.com"
    organization = "Payment Gateway"
  }
  
  validity_period_hours = 8760 # 1 ano
  
  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

resource "oci_load_balancer_certificate" "payment_gateway_cert" {
  load_balancer_id   = oci_load_balancer_load_balancer.payment_gateway_lb.id
  certificate_name   = "${var.project}-${var.environment}-cert"
  ca_certificate     = tls_self_signed_cert.payment_gateway_cert.cert_pem
  private_key        = tls_private_key.payment_gateway_key.private_key_pem
  public_certificate = tls_self_signed_cert.payment_gateway_cert.cert_pem
  
  lifecycle {
    create_before_destroy = true
  }
}

# Outputs
output "load_balancer_id" {
  description = "OCID do Load Balancer"
  value       = oci_load_balancer_load_balancer.payment_gateway_lb.id
}

output "load_balancer_ip" {
  description = "IP público do Load Balancer"
  value       = oci_load_balancer_load_balancer.payment_gateway_lb.ip_address_details[0].ip_address
}

output "load_balancer_hostname" {
  description = "Hostname do Load Balancer"
  value       = oci_load_balancer_load_balancer.payment_gateway_lb.hostname
}

# Variables
variable "compartment_id" {
  description = "OCID do compartimento onde os recursos serão criados"
  type        = string
}

variable "subnet_ids" {
  description = "Lista de OCIDs das sub-redes para o Load Balancer"
  type        = list(string)
}

variable "shape" {
  description = "Forma (shape) do Load Balancer"
  type        = string
  default     = "flexible"
}

variable "shape_details" {
  description = "Configurações detalhadas da forma (shape) do Load Balancer"
  type = object({
    minimum_bandwidth_in_mbps = number
    maximum_bandwidth_in_mbps = number
  })
  
  default = {
    minimum_bandwidth_in_mbps = 10
    maximum_bandwidth_in_mbps = 10
  }
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
