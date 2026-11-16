# 011. Hosting: Hetzner VPS + Docker Compose + Caddy + Terraform

- Status: Accepted
- Amended: 2026-11-16 — cost aligned with `docs/spec/12-infra-ops.md` §2 (~€20–30/month with two VPSs from R1; R0 runs one VPS); R0 has no staging (decision D-01)
- Amended: 2026-11-16 — by ADR 022: nothing is hosted in R0/R1; this plan (one Hetzner VPS, ~€5–10/month, staging optional) is the paid fallback "when hosting"; Terraform/Compose/images stay in the repo, validated in CI, not applied; D-01 superseded
- Date: 2026-11-16

## Context
- Open question Q3: cheap VPS (option A) vs AWS (option B, "AWS on the CV").
- Review I-01: AWS (ECS Fargate, RDS, ElastiCache, S3, CloudFront) ≈ $60–100/month vs VPS-based setup ≈ €20–30/month all-in (VPSs, R2, domains, LLM cap) — for a solo portfolio project with MVP-scale load.
- Environments: `local` → `staging` (auto-deploy from `main`) → `production` (tag `v*`) from R1. In R0 there is no staging: the only deployed environment is the future production host (real data, allowlist = author), auto-deployed from `main` (see `docs/spec/12-infra-ops.md` §1).
- Same-site domains are required (ADR 008).

## Decision
Run staging and production on a **Hetzner VPS** with **Docker Compose**, **Caddy** as reverse proxy with automatic TLS, and **Terraform** for infrastructure. No AWS.
- Compose services: api, postgres, redis, Caddy (R0); + worker, safe-fetcher, observability from R1; images built in GitHub Actions.
- SPA: Cloudflare Pages with custom domain `app.<domain>` (same-site with `api.<domain>`, ADR 008); fallback — static files in the Caddy image.
- Terraform manages the VPS, DNS records, the Cloudflare Pages project/custom domain and the Cloudflare R2 bucket(s).
- Object storage: Cloudflare R2 (S3-compatible); MinIO locally.
- Release flow: build images → `prisma migrate deploy` (role `applyra_maintenance`, expand/contract only) → api → worker (R1+) → SPA to Pages → smoke tests → Sentry release.
- Infrastructure is code; the IaC skill is still demonstrated without AWS cost.

## Alternatives considered
- AWS (ECS Fargate, RDS, ElastiCache, S3, CloudFront) — ≈ $60–100/month; more services to operate; rejected on cost.
- PaaS (Render, Fly.io, Railway) — less to show for infra skills; per-service pricing adds up with worker + Redis + Postgres.
- Kubernetes (k3s) — operational overhead without a scaling need.
- Managed Postgres — extra cost; Postgres in a container with tested backups is sufficient at this scale.

## Consequences
- Positive: ~€20–30/month from R1 (prod + staging VPS), one VPS in R0; full control; reproducible via Terraform; simple Compose mental model shared with local dev.
- Negative / trade-offs: single host = single point of failure; we own OS patching, backups and monitoring; no "AWS" line on the CV.
- Follow-ups: none open for hosting. Resolved in `docs/spec/12-infra-ops.md`: WAL-G into R2 with RPO/RTO and monthly restore test (I-02); nightly `pg_dump` in R0; squawk + `lock_timeout` (I-03); GitHub Environments + OIDC (S-16/17); admin UIs via Tailscale only (S-19); SPA on Cloudflare Pages; staging and production on two VPSs from R1 (synthetic-only staging on a separate registrable domain).
