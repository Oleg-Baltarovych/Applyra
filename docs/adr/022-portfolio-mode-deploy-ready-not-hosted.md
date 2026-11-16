# 022. Portfolio mode: deploy-ready, not hosted

- Status: Accepted
- Date: 2026-11-16
- Supersedes: decision D-01 (`docs/plans/mvp.md` §6: R0 = author's tracker on the future prod host with real data). Amends ADR 011 (hosting), 013 (observability), 014 (demo users).

## Context
- Applyra is a portfolio project. The author will most likely not host it (maybe later) and does not want recurring costs.
- ADR 011 + D-01 planned a prod VPS from R0 (real data) and a second staging VPS from R1 (~€20–30/month), plus R2 backups, WAL-G, restore tests, uptime checks and a tag-based release flow — all of it only meaningful with a running host.
- A reviewer (recruiter/engineer) needs to see the product working and the infra skills, not necessarily a live URL.

## Decision
No permanently hosted environment in R0/R1. The deliverable is a **deploy-ready** repository.
- **Present and validated in CI, never applied by default:** production Dockerfiles (api/worker — one multi-stage non-root image; caddy, which also serves the SPA with the `_headers` values), `compose.prod.yml`, Terraform for Hetzner + Cloudflare (`fmt -check` + `validate` with `-backend=false`), deploy workflow (`workflow_dispatch` only, lint-checked), `docker compose config` check. Images are built **multi-arch (amd64 + arm64)**.
- **Primary way to see the app:** `cp .env.example .env && docker compose up -d && pnpm dev` + `pnpm db:seed` (realistic synthetic data); **sign-in without Google credentials** — the ADR 014 demo user, `DEMO_ENABLED=true` in local by default; Google OAuth remains the real auth path when a client is configured (Google env vars optional). Devcontainer + "Open in GitHub Codespaces" (billed to the visitor's own free quota). README with screenshots/GIF/short video, architecture diagram, ADR links, CI badges.
- **Dogfooding (R0)** runs on the author's machine: local Postgres volume + a local `pg_dump` backup script with a manual restore check.
- **Moved to "Later — when hosting":** provisioning (`terraform apply`), first live deploy and Pages `_headers` check on a custom domain, off-site backups to R2, WAL-G, scheduled restore tests, external uptime monitoring, staging, tag-based release flow, live smoke tests.
- **Observability:** code-level instrumentation stays (pino, `prom-client`, Sentry SDK initialised only when `SENTRY_DSN` is set); Prometheus/Grafana/Alertmanager run as a local Compose profile. No hosted SaaS is required.

### If hosting later (figures as of 2026-11, verify before use)
- (a) **Oracle Cloud Always Free, Ampere A1** — allowance reduced to 2 OCPU / 12 GB per tenancy (from 4 / 24; reported 2026-06, enforcement dates differ between sources); card required at sign-up; A1 capacity often scarce; idle or over-limit instances can be reclaimed. Runs the same Compose stack unchanged (hence arm64 images).
- (b) **PaaS free tiers — poor fit:** Render free web services sleep after ~15 min idle (~1 min cold start), free Postgres expires after 30 days; Railway/Fly.io have no standing free tier for new accounts; Neon free Postgres (1 GB/project, 100 CU-hours) is fine for the DB, but the R1 BullMQ worker needs an always-on process + Redis.
- SPA on Cloudflare Pages free fits every option.
- (c) **Paid fallback:** the ADR 011 plan — one Hetzner VPS, ~€5–10/month (staging optional).

## Alternatives considered
- Keep ADR 011 + D-01 (hosted from R0) — recurring cost and ops work (patching, backups, monitoring) for a project nobody else uses.
- Free PaaS hosting as the main path — sleeps/expiry make a poor demo; worker + Redis do not fit free tiers.
- Screenshots/video only, no runnable path — weaker evidence; ADR 014 already rejected it as the only option.

## Consequences
- Positive: €0/month; no real third-party data hosted (smaller privacy surface); infra skills still shown and CI-verified; cloning the repo gives a working app in minutes.
- Negative / trade-offs: no live URL in the CV; deploy path is validated statically, not exercised end to end (first real deploy may surface issues); RPO for the author's local data depends on the local backup script; NFR availability/latency targets are not measured on a real host.
- Follow-ups: when hosting is chosen — pick option (a)/(c), run the "Later — when hosting" tasks in `docs/plans/mvp-tasks.md`, enable Turnstile before exposing demo publicly (`docs/spec/09-security-privacy.md` §11). Spec: `docs/spec/12-infra-ops.md` §1–2, §5, §8.
