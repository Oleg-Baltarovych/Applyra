# Floors only: the root module (envs/*) pins exact versions and commits the lock file.
terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.29" # v5 resource names (cloudflare_dns_record, nested R2 lifecycle rules)
    }
  }
}
