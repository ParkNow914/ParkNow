# outputs.tf
#
# Após `terraform apply`, esses valores são impressos no terminal e ficam
# disponíveis via `terraform output <nome>`.

output "instance_public_ip" {
  value       = oci_core_instance.app.public_ip
  description = "IP público da VM. Aponte o DNS do seu domínio aqui."
}

output "instance_id" {
  value       = oci_core_instance.app.id
  description = "OCID da instância (útil para destruir manualmente)."
}

output "ssh_command" {
  value       = "ssh ubuntu@${oci_core_instance.app.public_ip}"
  description = "Comando para conectar via SSH."
}

output "app_url" {
  value       = "https://${var.domain}"
  description = "URL final da aplicação (após DNS propagar e cloud-init terminar)."
}

output "next_steps" {
  value = <<-EOT

    ╔══════════════════════════════════════════════════════════════════════╗
    ║                  VM provisionada! Próximos passos:                   ║
    ╠══════════════════════════════════════════════════════════════════════╣
    ║                                                                      ║
    ║  1. Aponte o DNS de ${var.domain}                                     ║
    ║     para ${oci_core_instance.app.public_ip}                          ║
    ║     (no painel do DuckDNS / Cloudflare / seu registrar)              ║
    ║                                                                      ║
    ║  2. Aguarde ~5 min para o cloud-init terminar:                       ║
    ║       ssh ubuntu@${oci_core_instance.app.public_ip}                  ║
    ║       sudo tail -f /var/log/parknow-bootstrap.log                    ║
    ║                                                                      ║
    ║  3. Acesse: https://${var.domain}                                    ║
    ║     (Caddy obtém certificado Let's Encrypt automaticamente)          ║
    ║                                                                      ║
    ║  Para destruir tudo no futuro: terraform destroy                     ║
    ║                                                                      ║
    ╚══════════════════════════════════════════════════════════════════════╝
  EOT
  description = "Resumo do que fazer depois do apply."
}
