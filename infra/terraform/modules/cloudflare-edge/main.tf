# Cloudflare side (docs/spec/12-infra-ops.md §2, §3.1, §5): DNS for app./api./apex, the Pages project for the SPA
# with its custom domain, and R2 buckets with lifecycle rules. Records are proxied: the VPS firewall only admits
# Cloudflare ranges, so an unproxied record would make the origin unreachable (and expose its address).

locals {
  app_host = "${var.app_subdomain}.${var.root_domain}"
  api_host = "${var.api_subdomain}.${var.root_domain}"

  origin_records = merge(
    { for host in [local.api_host, var.root_domain] : "${host}/A" => { name = host, type = "A", content = var.origin_ipv4 } },
    { for host in [local.api_host, var.root_domain] : "${host}/AAAA" => { name = host, type = "AAAA", content = var.origin_ipv6 } },
  )
}

resource "cloudflare_dns_record" "origin" {
  for_each = local.origin_records

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type
  content = each.value.content
  proxied = true
  ttl     = 1 # automatic (required for proxied records)
  comment = "applyra: Caddy on the VPS (managed by Terraform)"
}

# Zone TLS: Full (strict) = Cloudflare verifies the origin certificate; TLS ≥ 1.2; HTTP → HTTPS at the edge.
# Always Use HTTPS redirects ACME HTTP-01 and the proxy terminates TLS-ALPN-01, so Caddy must obtain its
# certificate via DNS-01 (caddy-dns/cloudflare, token: Zone DNS edit on this zone) — M0-14b gate, infra/README.md.
resource "cloudflare_zone_setting" "tls" {
  for_each = {
    ssl              = "strict"
    min_tls_version  = "1.2"
    always_use_https = "on"
  }

  zone_id    = var.zone_id
  setting_id = each.key
  value      = each.value
}

# Zone-level Authenticated Origin Pulls: Cloudflare presents its origin-pull client certificate to the VPS.
# Only effective once Caddy requires it (client_auth require_and_verify with the Cloudflare origin-pull CA) —
# hard gate in M0-14b before HOSTING_ENABLED=true; until then the origin still accepts any TLS client in CF ranges.
resource "cloudflare_authenticated_origin_pulls_settings" "zone" {
  zone_id = var.zone_id
  enabled = true
}

resource "cloudflare_pages_project" "spa" {
  account_id        = var.account_id
  name              = var.pages_project_name
  production_branch = "main"
}

resource "cloudflare_pages_domain" "app" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.spa.name
  name         = local.app_host
}

resource "cloudflare_dns_record" "app" {
  zone_id = var.zone_id
  name    = local.app_host
  type    = "CNAME"
  content = cloudflare_pages_project.spa.subdomain # <project>.pages.dev
  proxied = true
  ttl     = 1
  comment = "applyra: SPA on Cloudflare Pages (managed by Terraform)"
}

resource "cloudflare_r2_bucket" "this" {
  for_each = var.r2_buckets

  account_id = var.account_id
  name       = each.key
  location   = var.r2_location

  lifecycle {
    prevent_destroy = true
  }
}

# Every bucket aborts stale multipart uploads; buckets with expire_after_days also delete objects by age.
resource "cloudflare_r2_bucket_lifecycle" "this" {
  for_each = var.r2_buckets

  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.this[each.key].name

  rules = concat(
    [{
      id         = "abort-incomplete-multipart"
      enabled    = true
      conditions = { prefix = "" }
      abort_multipart_uploads_transition = {
        condition = { type = "Age", max_age = 86400 } # seconds
      }
    }],
    each.value.expire_after_days == null ? [] : [{
      id         = "expire-after-${each.value.expire_after_days}d"
      enabled    = true
      conditions = { prefix = "" }
      delete_objects_transition = {
        condition = { type = "Age", max_age = each.value.expire_after_days * 86400 } # seconds
      }
    }],
  )
}
