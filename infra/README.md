# infra

| Path                                           | What                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compose/compose.yml`                          | Local **dev** infrastructure (postgres, redis = Valkey, minio, mailpit); ports on 127.0.0.1. `docker compose up -d` from the repo root (root `compose.yaml` includes it).                  |
| `compose/compose.prod.yml`                     | **Production** overlay (project `applyra-prod`): caddy, api, one-shot migrate; networks `edge` / `internal` (no egress) / `outbound`; no Postgres/Redis ports; dev-only services disabled. |
| `compose/gen-prod-env.mjs`                     | Generates an env file for the prod stack (random hex secrets, `*.applyra.localhost` domains, mode 0600, never overwrites).                                                                 |
| `compose/smoke.sh`                             | Prod-stack smoke: migrate, `/health/ready`, SPA fallback, asset 404, headers = `apps/web/public/_headers`. Also run by CI `deploy-ready`.                                                  |
| `docker/Dockerfile` + `docker/docker-bake.hcl` | Production images: `api` (distroless Node, non-root 65532, also runs migrations) and `caddy` (SPA + reverse proxy).                                                                        |
| `caddy/Caddyfile`                              | Edge config, same file locally and in production.                                                                                                                                          |
| `postgres/`                                    | Role bootstrap script (`init/10-roles.sql`), see its README.                                                                                                                               |
| `terraform/`                                   | Terraform (deploy-ready, never applied in R0/R1): `modules/hcloud-host` (VPS, firewall, volume, cloud-init), `modules/cloudflare-edge` (DNS, Pages, R2), `envs/production`.                |

Specs: `docs/spec/12-infra-ops.md` (environments, networks, migrations, CI/CD), `docs/spec/09-security-privacy.md` §9.1
(SPA headers), §14 (images). Production deploy: `.github/workflows/deploy-prod.yml` (dispatch-only, inert until hosting,
ADR 022). Owner setup when hosting: repo vars `HOSTING_ENABLED`, `API_DOMAIN`; Environment `production` with a required
reviewer and deployment branch policy **`main` only** (the workflow also refuses any other ref); vars/secrets listed in
the workflow header.

## Local production stack

Runs the real images with the production configuration on your machine. Uses its own compose project and volumes
(`applyra-prod`), never the dev database. Needs ports 80 and 443 free.

Hostnames: `https://app.applyra.localhost` (SPA), `https://api.applyra.localhost` (api), `https://applyra.localhost`
(→ app). `*.localhost` resolves to loopback in Chrome/Firefox; `app.` and `api.` share the site `applyra.localhost`, so
the `__Host-` session cookies behave as in production (`app.localhost` vs `api.localhost` would be different sites).
Caddy issues their certificates from its internal CA.

```bash
# from the repo root (Git Bash on Windows works)
node infra/compose/gen-prod-env.mjs --out .env.prod.local        # git- and docker-ignored
docker buildx bake -f infra/docker/docker-bake.hcl --load        # applyra/api:local + applyra/caddy:local
infra/compose/smoke.sh .env.prod.local                           # up postgres/redis → migrate → up api/caddy → checks

# by hand
C="docker compose -f infra/compose/compose.yml -f infra/compose/compose.prod.yml --env-file .env.prod.local"
$C up -d --wait postgres redis
$C run --rm migrate                                               # before every api rollout
$C up -d --wait api caddy
$C logs -f api
```

Browser: trust Caddy's root CA once, or accept the warning. Export it with
`$C cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt` and import it as a trusted root
(Windows: `certutil -user -addstore Root caddy-root.crt`); remove it again when done. curl:
`curl --cacert caddy-root.crt --resolve api.applyra.localhost:443:127.0.0.1 https://api.applyra.localhost/health/ready`
(on Windows add `--ssl-no-revoke`).

Sign-in: the image is built with the Google button off (no OAuth client for `*.localhost`), so `/sign-in` explains
that no method is configured. To try Google sign-in, set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and
`AUTH_SIGNUP_ALLOWLIST` in the env file, add `https://api.applyra.localhost/api/auth/callback/google` to the client,
and rebuild the caddy target with the button on (edit `VITE_AUTH_GOOGLE_ENABLED` in the Dockerfile `web-build` stage
locally — not committed).

Cleanup (deletes the prod-stack volumes only):

```bash
$C --profile migrate down -v
rm .env.prod.local caddy-root.crt
```

## Deploy-ready / if hosting later

Nothing is hosted in R0/R1 (ADR 022). The repo stays deploy-ready: images, `compose.prod.yml`, `deploy-prod.yml` and
Terraform are checked in CI (`terraform.yml`: `fmt -check`, `init -backend=false` + `validate`, no credentials, no
plan) but never applied. Provisioning is M0-13 (`docs/plans/mvp-tasks.md` → `Later — when hosting`).

Variants (`docs/spec/12-infra-ops.md` §2.1, data as of 2026-11 — re-check before choosing):

| Variant                                 | Fit                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Oracle Cloud Always Free, Ampere A1 | 2 OCPU / 12 GB per tenancy, card at sign-up, A1 capacity often short, idle instances may be reclaimed. Same Compose stack unchanged (arm64 images). Terraform here targets Hetzner: needs an `oci` host module.         |
| (b) PaaS free tiers                     | Poor fit: Render free sleeps after ~15 min and deletes free Postgres after 30 days; Railway / Fly.io have no permanent free tier; Neon free Postgres fits the DB, but the R1 worker needs an always-on process + Redis. |
| SPA                                     | Cloudflare Pages free — fits every variant (`modules/cloudflare-edge`).                                                                                                                                                 |
| (c) Paid fallback (ADR 011, this code)  | One Hetzner VPS (~€5–10/month; `server_type` = `cax*` ARM or `cx*` x86), Cloudflare DNS/Pages/R2; staging optional (`envs/staging` = copy of `envs/production` with its own domain).                                    |

What `envs/production` creates: Hetzner server + firewall (inbound 80/443 from Cloudflare ranges only, via the
provider's `cloudflare_ip_ranges`; 22 closed) + ext4 volume (Docker data-root `/srv/data`); cloud-init installs Docker,
Tailscale (`--ssh`, `--advertise-tags=tag:prod`, single-use auth key) and ufw (80/443 + `tailscale0`), blocks the
metadata service (169.254.169.254) for containers (DOCKER-USER, re-applied on every Docker start), drops cloud-init's
copies of `user_data` and disables cloud-init after the first boot, creates the `deploy` user and `/opt/applyra`.
Cloudflare zone: SSL Full (strict), min TLS 1.2, Always Use HTTPS, Authenticated Origin Pulls (zone-level).
Cloudflare: proxied `api.`/apex A+AAAA → VPS, `app.` CNAME → Pages project + custom domain, R2 bucket
`applyra-prod-backups` (lifecycle: delete after 14 days, abort multipart after 1 day). State: S3 backend on R2
(`use_lockfile = true`).

Apply order (M0-13):

1. Owner prerequisites: domain zone in Cloudflare; Hetzner project + API token; Cloudflare API token (Zone DNS edit
   for the zone, Zone Settings edit, SSL and Certificates edit, Pages edit, R2 edit); an ed25519 deploy key pair
   (private half → `DEPLOY_SSH_KEY`). Tailnet policy: `tagOwners` for `tag:prod` (owner only) and a CI tag (e.g.
   `tag:ci`, the deploy OAuth client); ACLs allow only the owner and `tag:ci` → `tag:prod:22` (plus Tailscale SSH rule
   for the owner); nothing else reaches the host. Auth key: **single-use, pre-authorized, tagged `tag:prod`, expiry
   ≤ 1 day**. Option for M0-13: a Tailscale OAuth client (scope `auth_keys`, tag `tag:prod`) minting the key at apply
   time instead of a hand-made key.
2. State bucket by hand (chicken-and-egg): private R2 bucket `applyra-tfstate` (no public access / r2.dev URL,
   object versioning on if R2 offers it, else periodic copies) + an R2 S3 token scoped to that bucket only; the
   state holds `user_data` and IPs, so treat it as a secret. Check that R2 still supports the conditional writes
   `use_lockfile` relies on. Backup token (M0-15b): Object Read & Write on `applyra-prod-backups` only.
3. `cd infra/terraform/envs/production`, copy `backend.hcl.example` → `backend.hcl` and `terraform.tfvars.example` →
   `terraform.tfvars` (both gitignored); secrets as `TF_VAR_hcloud_token`, `TF_VAR_cloudflare_api_token`,
   `TF_VAR_tailscale_auth_key`; `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` = the state token.
4. `terraform init -backend-config=backend.hcl` → `terraform plan -out=prod.tfplan` → review (firewall sources, DNS
   proxied) → `terraform apply prod.tfplan`.
5. Check the host joined the tailnet; take its SSH host key (`ssh-keyscan` over the tailnet) → `DEPLOY_SSH_KNOWN_HOSTS`;
   outputs → Environment vars (`DEPLOY_HOST`, `APP_DOMAIN`, `API_DOMAIN`, `ROOT_DOMAIN`, `CF_PAGES_PROJECT`).
6. TLS at the origin (M0-14b, before `HOSTING_ENABLED=true`): the zone runs Full (strict) + Always Use HTTPS, so
   ACME HTTP-01 is redirected and TLS-ALPN-01 is terminated by the proxy → Caddy uses **DNS-01**
   (`caddy-dns/cloudflare` in the caddy image, token: Zone DNS edit on this zone only, as an Environment secret).
   **Hard gate:** Caddy `client_auth { mode require_and_verify; trust_pool file <Cloudflare origin-pull CA> }` on the
   api and apex sites — Authenticated Origin Pulls is enabled at the zone but protects nothing until Caddy
   requires the client certificate. `trusted_proxies` (Cloudflare ranges) and `CF-Connecting-IP` as client IP also
   stay in M0-14b.
7. Images (M0-14b) → `deploy-prod.yml` with `HOSTING_ENABLED=true` (header of that workflow lists all vars/secrets).

The Tailscale key and the rest of `user_data` stay in Hetzner server metadata (readable from the host — hence the
DOCKER-USER block) and in the state: a single-use, short-lived key is useless once consumed; the state bucket is
secret. The `deploy` user is in the `docker` group = root-equivalent on the host; it is reachable only over the
tailnet (ACL above) with the deploy key. Changing `user_data` never replaces the server (`ignore_changes`); rebuild with
`terraform apply -replace=module.host.hcloud_server.host`. Volume and R2 buckets have `prevent_destroy`.

Local check (same image as CI):

```bash
TF=hashicorp/terraform:1.17.2   # digest in .github/workflows/terraform.yml
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/infra/terraform:/tf" -w /tf "$TF" fmt -check -recursive
MSYS_NO_PATHCONV=1 docker run --rm -e TF_DATA_DIR=/tmp/tf -v "$(pwd -W)/infra/terraform:/tf:ro" -w /tf/envs/production   --entrypoint sh "$TF" -c 'terraform init -backend=false -lockfile=readonly && terraform validate'
# after a provider bump (writable mount): terraform providers lock -platform=linux_amd64 -platform=linux_arm64 #   -platform=darwin_amd64 -platform=darwin_arm64 -platform=windows_amd64
```

(`$(pwd -W)` / `MSYS_NO_PATHCONV=1` are for Git Bash on Windows; use `$PWD` elsewhere.)

## Notes

- The api image has no shell, npm, pnpm or corepack (distroless). Debug with `docker compose logs` or an ephemeral
  sidecar (`docker run --rm -it --network applyra-prod_internal …`), never by adding tools to the image.
- Worker (M3-01): same image with `command: ["dist/worker.js"]`, networks `internal` + `outbound`.
- Valkey requires a password in prod (`REDIS_PASSWORD`; config file in tmpfs, `REDISCLI_AUTH` for the healthcheck).
- Non-root Caddy binds 80/443 via `sysctls: net.ipv4.ip_unprivileged_port_start: 80` (file capabilities do not survive
  `no-new-privileges`).
