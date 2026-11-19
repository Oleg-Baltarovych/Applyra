# Production (docs/spec/12-infra-ops.md §2; ADR 011, ADR 022): deploy-ready, applied only when hosting (M0-13).
# Apply order and owner prerequisites: infra/README.md «Deploy-ready / if hosting later».

locals {
  name   = "applyra-prod"
  labels = { app = "applyra", env = "production", managed-by = "terraform" }
}

# Cloudflare edge ranges from the provider (public /ips endpoint) instead of a pinned list: no manual upkeep, and a
# change Cloudflare publishes shows up in `terraform plan` as a firewall diff to review before apply.
data "cloudflare_ip_ranges" "edge" {}

module "host" {
  source = "../../modules/hcloud-host"

  name                  = local.name
  server_type           = var.server_type
  location              = var.location
  volume_size_gb        = var.volume_size_gb
  allowed_http_cidrs    = concat(data.cloudflare_ip_ranges.edge.ipv4_cidrs, data.cloudflare_ip_ranges.edge.ipv6_cidrs)
  deploy_ssh_public_key = var.deploy_ssh_public_key
  tailscale_auth_key    = var.tailscale_auth_key
  tailscale_hostname    = local.name
  tailscale_tags        = var.tailscale_tags
  labels                = local.labels
}

module "edge" {
  source = "../../modules/cloudflare-edge"

  account_id         = var.cloudflare_account_id
  zone_id            = var.cloudflare_zone_id
  root_domain        = var.root_domain
  origin_ipv4        = module.host.ipv4_address
  origin_ipv6        = module.host.ipv6_address
  pages_project_name = var.pages_project_name

  # spec 12 §1/§5: separate buckets; backups kept 14 days (R2 lifecycle). Documents/exports buckets are created
  # with the features that use them (Later), not here.
  r2_buckets = {
    "applyra-prod-backups" = { expire_after_days = 14 }
  }
}
