variable "account_id" {
  description = "Cloudflare account id (Pages, R2)."
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone id of root_domain."
  type        = string
}

variable "root_domain" {
  description = "Zone apex, e.g. example.com. Hosts: app.<root> (Pages), api.<root> (VPS), <root> (VPS, Caddy redirects to app.)."
  type        = string
}

variable "app_subdomain" {
  type    = string
  default = "app"
}

variable "api_subdomain" {
  type    = string
  default = "api"
}

variable "origin_ipv4" {
  description = "VPS IPv4 for api.<root> and <root> (proxied)."
  type        = string
}

variable "origin_ipv6" {
  description = "VPS IPv6 for api.<root> and <root> (proxied)."
  type        = string
}

variable "pages_project_name" {
  description = "Cloudflare Pages project (= CF_PAGES_PROJECT in deploy-prod.yml; direct upload via wrangler, no Git source)."
  type        = string
}

variable "r2_location" {
  description = "R2 location hint for new buckets (weur = Western Europe, near Hetzner DE/FI)."
  type        = string
  default     = "weur"
}

variable "r2_buckets" {
  description = "R2 buckets by name. expire_after_days = lifecycle deletion (backups: 14, spec 12 §5); null keeps objects."
  type = map(object({
    expire_after_days = optional(number)
  }))

  validation {
    condition     = alltrue([for n in keys(var.r2_buckets) : can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", n))])
    error_message = "r2_buckets: names are 3–63 chars of lowercase letters, digits and dashes."
  }
}
