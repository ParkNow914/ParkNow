# versions.tf
# Pinned versions: garante reprodutibilidade e evita quebras de schema do
# provider OCI entre runs.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}
