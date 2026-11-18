# Applyra image build graph (M0-14). Same command locally and in CI; context = repo root.
#   docker buildx bake -f infra/docker/docker-bake.hcl --load                       # host platform, local tags
#   PLATFORMS=linux/amd64,linux/arm64 docker buildx bake -f infra/docker/docker-bake.hcl --set '*.output=type=cacheonly'
# Image refs (bases) live in the Dockerfile FROM lines (Renovate's dockerfile manager bumps them); none here.

variable "TAG" {
  default = "local"
}

# Comma-separated; empty = the builder's native platform (what `--load` into the local image store needs).
variable "PLATFORMS" {
  default = ""
}

# Public API origin baked into the SPA bundle (public value, not a secret). Default = the local prod stack.
variable "VITE_API_URL" {
  default = "https://api.applyra.localhost/api/v1"
}

group "default" {
  targets = ["api", "caddy"]
}

target "_common" {
  context    = "."
  dockerfile = "infra/docker/Dockerfile"
  platforms  = PLATFORMS == "" ? [] : split(",", PLATFORMS)
}

target "api" {
  inherits = ["_common"]
  target   = "api"
  tags     = ["applyra/api:${TAG}"]
}

target "caddy" {
  inherits = ["_common"]
  target   = "caddy"
  tags     = ["applyra/caddy:${TAG}"]
  args = {
    VITE_API_URL = VITE_API_URL
  }
}
