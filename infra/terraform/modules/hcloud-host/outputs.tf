output "ipv4_address" {
  description = "Public IPv4 (DNS records point here, proxied by Cloudflare)."
  value       = hcloud_server.host.ipv4_address
}

output "ipv6_address" {
  description = "Public IPv6 (first address of the server's /64)."
  value       = hcloud_server.host.ipv6_address
}

output "server_id" {
  value = hcloud_server.host.id
}

output "volume_id" {
  value = hcloud_volume.data.id
}
