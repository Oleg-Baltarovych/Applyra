output "server_ipv4" {
  value = module.host.ipv4_address
}

output "server_ipv6" {
  value = module.host.ipv6_address
}

output "deploy_host" {
  description = "Tailnet machine name → Environment var DEPLOY_HOST."
  value       = local.name
}

output "app_domain" {
  description = "→ APP_DOMAIN."
  value       = module.edge.app_host
}

output "api_domain" {
  description = "→ API_DOMAIN (repo variable and Environment var)."
  value       = module.edge.api_host
}

output "pages_project_name" {
  description = "→ CF_PAGES_PROJECT."
  value       = module.edge.pages_project_name
}

output "r2_bucket_names" {
  value = module.edge.r2_bucket_names
}
