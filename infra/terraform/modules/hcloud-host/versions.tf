# Floors only: the root module (envs/*) pins exact versions and commits the lock file.
terraform {
  required_version = ">= 1.10"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.70"
    }
  }
}
