# Production host (docs/spec/12-infra-ops.md §2, §3; ADR 011): one Hetzner VPS running the Compose stack.
# Perimeter = Hetzner firewall: inbound 80/443 from Cloudflare only, nothing else (22 stays closed; SSH and admin UIs
# go through Tailscale). Docker-published ports bypass the host's ufw, so this firewall is the authoritative edge filter.

resource "hcloud_ssh_key" "deploy" {
  name       = "${var.name}-deploy"
  public_key = var.deploy_ssh_public_key
  labels     = var.labels
}

resource "hcloud_firewall" "edge" {
  name   = "${var.name}-edge"
  labels = var.labels

  dynamic "rule" {
    for_each = toset(["80", "443"])
    content {
      description = "Cloudflare edge to Caddy :${rule.value}"
      direction   = "in"
      protocol    = "tcp"
      port        = rule.value
      source_ips  = var.allowed_http_cidrs
    }
  }
}

# Created before the server so its id can be baked into cloud-init (stable /dev/disk/by-id path).
resource "hcloud_volume" "data" {
  name              = "${var.name}-data"
  size              = var.volume_size_gb
  location          = var.location
  format            = "ext4"
  delete_protection = var.protect
  labels            = var.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "hcloud_server" "host" {
  name               = var.name
  server_type        = var.server_type
  image              = var.image
  location           = var.location
  ssh_keys           = [hcloud_ssh_key.deploy.id]
  firewall_ids       = [hcloud_firewall.edge.id]
  delete_protection  = var.protect
  rebuild_protection = var.protect
  labels             = var.labels

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    volume_id             = hcloud_volume.data.id
    deploy_ssh_public_key = var.deploy_ssh_public_key
    tailscale_auth_key    = var.tailscale_auth_key
    tailscale_hostname    = var.tailscale_hostname
    tailscale_tags        = var.tailscale_tags
  })

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  lifecycle {
    # user_data runs on first boot only and carries a single-use key: a new key or edited bootstrap must never
    # replace the running server. Re-provisioning is a deliberate `terraform apply -replace`.
    ignore_changes = [user_data, image, ssh_keys]
  }
}

resource "hcloud_volume_attachment" "data" {
  volume_id = hcloud_volume.data.id
  server_id = hcloud_server.host.id
  automount = false # cloud-init mounts it at /srv/data by id (fstab), before Docker starts
}
