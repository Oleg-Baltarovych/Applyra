# syntax=docker/dockerfile:1
# Applyra production images (M0-14; docs/spec/12-infra-ops.md §3, 09 §14). Build with the bake file:
#   docker buildx bake -f infra/docker/docker-bake.hcl --load          (targets: api, caddy)
# Context = repo root (allowlist in /.dockerignore). Stages:
#   build      ($BUILDPLATFORM) full frozen install, contracts + api build (tsc, prisma generate); JS is arch-independent
#   web-build  ($BUILDPLATFORM) Vite build of the SPA with public VITE_* build args
#   prod-deps  ($TARGETPLATFORM, the only stage under QEMU) prod-only install of @applyra/api + its schema engine
#   api        distroless Node runtime: dist/main.js (default) · scripts/db-migrate.mjs (compose `migrate`)
#              · dist/worker.js from M3-01 (compose worker service, `command: ["dist/worker.js"]`)
#   caddy      Caddy + SPA dist (fallback / local prod stack; prod SPA = Cloudflare Pages, ADR 011)
# No `pnpm deploy`: pnpm 11 non-legacy deploy needs injectWorkspacePackages (breaks dev symlinks) and `--legacy`
# is not frozen-lockfile-safe → prod-deps installs with `--prod --filter @applyra/api...` and the runtime copies the
# resulting node_modules trees (symlinks preserved under the same /app layout).
# Base images: tag@sha256 (multi-arch index digest) in FROM lines — Renovate's dockerfile manager bumps them.

# ── pnpm base: pnpm at the exact `packageManager` version (no corepack: Node 25+ ships none, ADR 024) ──────────────
# node:<engines version>-trixie-slim has npm, used only to install pnpm; never in the runtime image.
FROM --platform=$BUILDPLATFORM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS pnpm-build
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
COPY package.json ./
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# packageManager is "pnpm@<version>" (no "+sha…" suffix in this repo; one would be stripped): npm verifies the tarball
# against the registry's sha512 integrity. package.json is the single source of the version (no duplicate bake var).
# npm version is pinned: it comes from package.json packageManager (hadolint cannot see it).
# hadolint ignore=DL3016
RUN pm="$(node -p "require('./package.json').packageManager.split('+')[0]")" \
  && npm install --global --no-fund --no-audit "$pm" \
  && pnpm config set store-dir /pnpm/store --location global

FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS pnpm-target
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
COPY package.json ./
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# npm version is pinned: it comes from package.json packageManager (hadolint cannot see it).
# hadolint ignore=DL3016
RUN pm="$(node -p "require('./package.json').packageManager.split('+')[0]")" \
  && npm install --global --no-fund --no-audit "$pm" \
  && pnpm config set store-dir /pnpm/store --location global

# ── build (BUILDPLATFORM) ─────────────────────────────────────────────────────────────────────────────────────────
# The store lives in an image layer (not a cache mount): with the GHA layer cache a cached `fetch` layer would
# otherwise hit an empty store in the next step.
FROM pnpm-build AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --offline --frozen-lockfile --filter @applyra/api... --filter @applyra/web...
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/api apps/api
# turbo's order (contracts → api db:generate → api build) without the root devDependencies (turbo).
RUN pnpm --filter @applyra/contracts build \
  && pnpm --filter @applyra/api db:generate \
  && pnpm --filter @applyra/api build

FROM build AS web-build
# Public build-time value only (it ends up in the bundle). Never a secret here. The Google button stays off in this
# image (local prod stack has no OAuth client); the real SPA is built by deploy-prod.yml for Cloudflare Pages.
ARG VITE_API_URL
COPY apps/web apps/web
RUN test -n "$VITE_API_URL" \
  && VITE_API_URL="$VITE_API_URL" VITE_AUTH_GOOGLE_ENABLED=false pnpm --filter @applyra/web build

# ── prod-deps (TARGETPLATFORM) ────────────────────────────────────────────────────────────────────────────────────
FROM pnpm-target AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod
# Every manifest a workspace:* range points at must exist for the frozen-lockfile check (root → @applyra/config).
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --offline --frozen-lockfile --prod --filter @applyra/api...
# Bake the target's Prisma schema engine (downloaded lazily on the first CLI command; the migrate job runs on a
# network without egress). Fails the build if no engine landed.
WORKDIR /app/apps/api
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
RUN node node_modules/prisma/build/index.js version \
  && test -n "$(find /app/node_modules/.pnpm -path '*/@prisma/engines/schema-engine-*' -type f)"

# ── api runtime ───────────────────────────────────────────────────────────────────────────────────────────────────
# Distroless Node 26 (26.13.1 at M0-14 ≥ engines), uid 65532, no shell / npm / corepack by construction.
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:1d736cf8b5716c07a245301f92717143215d248fd55771ee1936ef4b3302e531 AS api
ENV NODE_ENV=production CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/apps/api/package.json /app/apps/api/prisma.config.ts ./apps/api/
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/scripts/db-migrate.mjs ./apps/api/scripts/db-migrate.mjs
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
USER 65532:65532
EXPOSE 3000
# No shell in the image: exec-form healthcheck through node's fetch.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["dist/main.js"]

# ── caddy (SPA + reverse proxy) ───────────────────────────────────────────────────────────────────────────────────
# Caddy 2.11.9 (released 2026-11-05; alpine tag pushed 2026-11-13).
FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0 AS caddy
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/apps/web/dist /srv
# _headers is the Cloudflare Pages copy of the header policy; Caddy has it in the Caddyfile and must not serve it.
# Non-root: binds 80/443 via compose `sysctls: net.ipv4.ip_unprivileged_port_start=80` (file capabilities do not
# survive no-new-privileges). Data/config dirs owned by the runtime uid.
RUN rm -f /srv/_headers \
  && APP_DOMAIN=app.example.test API_DOMAIN=api.example.test ROOT_DOMAIN=example.test \
     API_ORIGIN=https://api.example.test caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
  && mkdir -p /data/caddy /config/caddy \
  && chown -R 65532:65532 /data /config
USER 65532:65532
