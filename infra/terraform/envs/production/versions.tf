# Exact pins (spec 04 §7.1 style); Renovate's terraform manager bumps them together with .terraform.lock.hcl, and
# required_version together with the CI image (renovate.json group "terraform").
terraform {
  required_version = "1.17.2"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "1.70.2"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.29.0"
    }
  }

  # State in R2 (S3 API) — when hosting only (M0-13). CI never initialises it (`init -backend=false`).
  # Endpoint comes from `-backend-config=backend.hcl` (see backend.hcl.example), credentials from
  # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY = an R2 token scoped to the state bucket only.
  backend "s3" {
    bucket       = "applyra-tfstate"
    key          = "production/terraform.tfstate"
    region       = "auto"
    use_lockfile = true # S3-native lock object (conditional writes), no DynamoDB

    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
