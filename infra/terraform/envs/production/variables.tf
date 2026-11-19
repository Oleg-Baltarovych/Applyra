# Secrets: pass as TF_VAR_* env vars (or an untracked *.tfvars); never commit them. See terraform.tfvars.example.

variable "hcloud_token" {
  description = "Hetzner Cloud API token (read/write, project applyra)."
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token: Zone DNS edit (this zone), Pages edit, R2 edit — nothing else."
  type        = string
  sensitive   = true
}

variable "tailscale_auth_key" {
  description = "Tailscale auth key for the host's first boot: single-use, pre-authorized, tagged (e.g. tag:prod), expires in ≤ 1 day."
  type        = string
  sensitive   = true
}

variable "deploy_ssh_public_key" {
  description = "Public half of DEPLOY_SSH_KEY (Environment `production`)."
  type        = string
}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "root_domain" {
  description = "Zone apex; app.<root> = APP_DOMAIN, api.<root> = API_DOMAIN."
  type        = string
}

variable "server_type" {
  description = "cax* = ARM (Ampere), cx*/cpx* = x86. Spec 12 §2: 2–4 vCPU / 4–8 GB."
  type        = string
  default     = "cax21"
}

variable "location" {
  type    = string
  default = "fsn1"
}

variable "volume_size_gb" {
  type    = number
  default = 20
}

variable "pages_project_name" {
  description = "= CF_PAGES_PROJECT."
  type        = string
  default     = "applyra"
}

variable "tailscale_tags" {
  description = "Tags the host advertises; the tailnet policy must list them in tagOwners and allow only owner + CI to tag:prod:22."
  type        = list(string)
  default     = ["tag:prod"]
}
