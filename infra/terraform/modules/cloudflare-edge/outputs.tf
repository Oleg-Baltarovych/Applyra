output "app_host" {
  value = local.app_host
}

output "api_host" {
  value = local.api_host
}

output "pages_project_name" {
  value = cloudflare_pages_project.spa.name
}

output "pages_subdomain" {
  value = cloudflare_pages_project.spa.subdomain
}

output "r2_bucket_names" {
  value = sort([for b in cloudflare_r2_bucket.this : b.name])
}
