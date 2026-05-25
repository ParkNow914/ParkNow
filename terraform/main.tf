# main.tf
#
# Provisiona a infra ParkNow no Oracle Cloud Free Tier (always free):
#   - 1× VCN com Internet Gateway e route table 0.0.0.0/0
#   - 1× Security List (ingress 22/80/443, egress all)
#   - 1× Subnet pública
#   - 1× Compute Instance VM.Standard.A1.Flex (4 OCPU, 24 GB RAM, Ubuntu 22.04 ARM)
#   - Boot volume 50 GB
#   - Cloud-init que roda scripts/bootstrap-oracle.sh automaticamente
#
# Tudo dentro do free tier. Custo: R$ 0/mês.

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}

# ─── Lookups ──────────────────────────────────────────────────────────────

# Pega o primeiro Availability Domain disponível na região.
data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# Imagem oficial Canonical Ubuntu 22.04 ARM (aarch64), mais recente.
data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# ─── Networking ───────────────────────────────────────────────────────────

resource "oci_core_vcn" "vcn" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "${var.name_prefix}-vcn"
  dns_label      = "parknow"
}

resource "oci_core_internet_gateway" "igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.vcn.id
  display_name   = "${var.name_prefix}-igw"
  enabled        = true
}

resource "oci_core_route_table" "public_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.vcn.id
  display_name   = "${var.name_prefix}-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.igw.id
  }
}

resource "oci_core_security_list" "public_sl" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.vcn.id
  display_name   = "${var.name_prefix}-public-sl"

  # Egress: tudo liberado
  egress_security_rules {
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
    protocol         = "all"
  }

  # SSH (22)
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTP (80) — Caddy redireciona pra HTTPS
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  # HTTPS (443)
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_subnet" "public_subnet" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.vcn.id
  cidr_block        = "10.0.1.0/24"
  display_name      = "${var.name_prefix}-public-subnet"
  dns_label         = "public"
  route_table_id    = oci_core_route_table.public_rt.id
  security_list_ids = [oci_core_security_list.public_sl.id]

  # Subnet pública: assigna IP público às VMs por padrão.
  prohibit_public_ip_on_vnic = false
}

# ─── Cloud-init (roda na primeira boot) ───────────────────────────────────

locals {
  # O template renderiza o bootstrap inline. user_data é base64-encoded
  # automaticamente pelo provider OCI.
  cloud_init = <<-CLOUDINIT
    #cloud-config
    package_update: true
    package_upgrade: true
    write_files:
      - path: /home/ubuntu/run-bootstrap.sh
        owner: ubuntu:ubuntu
        permissions: '0755'
        content: |
          #!/usr/bin/env bash
          set -e
          export DOMAIN='${var.domain}'
          export EMAIL_USER='${var.email_user}'
          export EMAIL_PASS='${var.email_pass}'
          export REPO_URL='${var.repo_url}'
          curl -fsSL "${var.repo_url == "https://github.com/ParkNow914/ParkNow.git" ? "https://raw.githubusercontent.com/ParkNow914/ParkNow/main/scripts/bootstrap-oracle.sh" : "${var.repo_url}/raw/main/scripts/bootstrap-oracle.sh"}" | bash
    runcmd:
      - sudo -iu ubuntu bash /home/ubuntu/run-bootstrap.sh > /var/log/parknow-bootstrap.log 2>&1
  CLOUDINIT
}

# ─── VM ───────────────────────────────────────────────────────────────────

resource "oci_core_instance" "app" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = var.instance_shape
  display_name        = "${var.name_prefix}-app"

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public_subnet.id
    assign_public_ip = true
    hostname_label   = var.name_prefix
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  metadata = {
    ssh_authorized_keys = file(pathexpand(var.ssh_public_key_path))
    user_data           = base64encode(local.cloud_init)
  }

  # Em capacity-outs do A1, vale tentar outra AD. Aqui usamos a [0]; se sua
  # região tiver várias e a primeira estiver lotada, edite o índice ou
  # comente o `availability_domain` para deixar o OCI escolher.
}
