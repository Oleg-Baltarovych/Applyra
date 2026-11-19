variable "name" {
  description = "Resource name prefix, e.g. applyra-prod."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,40}$", var.name))
    error_message = "name: lowercase letters, digits and dashes."
  }
}

variable "server_type" {
  description = "Hetzner server type: x86 (cx*/cpx*/ccx*) or ARM (cax*). Images are multi-arch (amd64 + arm64)."
  type        = string

  validation {
    condition     = can(regex("^(cx|cpx|ccx|cax)[0-9]+$", var.server_type))
    error_message = "server_type: a Hetzner type such as cax21 (ARM) or cx33 (x86)."
  }
}

variable "location" {
  description = "Hetzner location (server and volume must share it), e.g. fsn1, nbg1, hel1."
  type        = string
}

variable "image" {
  description = "OS image; the cloud-init bootstrap targets Ubuntu LTS (apt repos for Docker and Tailscale)."
  type        = string
  default     = "ubuntu-24.04"
}

variable "volume_size_gb" {
  description = "Data volume size (Docker data-root: Postgres and Valkey volumes live here)."
  type        = number
  default     = 20

  validation {
    condition     = var.volume_size_gb >= 10
    error_message = "volume_size_gb: Hetzner volumes start at 10 GB."
  }
}

variable "allowed_http_cidrs" {
  description = "Source ranges allowed on 80/443 (Cloudflare edge). Nothing else is open inbound."
  type        = list(string)

  validation {
    condition     = length(var.allowed_http_cidrs) > 0 && alltrue([for c in var.allowed_http_cidrs : can(cidrhost(c, 0))])
    error_message = "allowed_http_cidrs: a non-empty list of CIDRs."
  }

  validation {
    condition     = !anytrue([for c in var.allowed_http_cidrs : contains(["0.0.0.0/0", "::/0"], c)])
    error_message = "allowed_http_cidrs: the origin is reachable only through Cloudflare, never from anywhere."
  }
}

variable "deploy_ssh_public_key" {
  description = "Public key of the `deploy` user (deploy-prod.yml connects over the tailnet). Also registered in Hetzner so no root password is issued."
  type        = string
}

variable "tailscale_auth_key" {
  description = "Tailscale auth key for the first boot: single-use, pre-authorized, tagged, short expiry. Ends up in user_data (server metadata) and state."
  type        = string
  sensitive   = true
}

variable "tailscale_hostname" {
  description = "Machine name in the tailnet (= DEPLOY_HOST in the production Environment)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,62}$", var.tailscale_hostname))
    error_message = "tailscale_hostname: a DNS label (it is interpolated into the bootstrap script)."
  }
}

variable "tailscale_tags" {
  description = "ACL tags the host advertises (the auth key must be allowed to apply them: tagOwners in the tailnet policy)."
  type        = list(string)
  default     = ["tag:prod"]

  validation {
    condition     = length(var.tailscale_tags) > 0 && alltrue([for t in var.tailscale_tags : can(regex("^tag:[a-z0-9-]+$", t))])
    error_message = "tailscale_tags: one or more tags like tag:prod (interpolated into the bootstrap script)."
  }
}

variable "protect" {
  description = "Hetzner delete/rebuild protection on the server and the volume."
  type        = bool
  default     = true
}

variable "labels" {
  description = "Labels on every Hetzner resource."
  type        = map(string)
  default     = {}
}
