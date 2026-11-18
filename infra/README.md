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

## Notes

- The api image has no shell, npm, pnpm or corepack (distroless). Debug with `docker compose logs` or an ephemeral
  sidecar (`docker run --rm -it --network applyra-prod_internal …`), never by adding tools to the image.
- Worker (M3-01): same image with `command: ["dist/worker.js"]`, networks `internal` + `outbound`.
- Valkey requires a password in prod (`REDIS_PASSWORD`; config file in tmpfs, `REDISCLI_AUTH` for the healthcheck).
- Non-root Caddy binds 80/443 via `sysctls: net.ipv4.ip_unprivileged_port_start: 80` (file capabilities do not survive
  `no-new-privileges`).
