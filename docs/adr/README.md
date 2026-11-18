# Architecture Decision Records

Process and template: [000](000-record-architecture-decisions.md). New ADRs: `/adr` procedure, next free number.

| # | Title | Status | Decision |
|---|---|---|---|
| [000](000-record-architecture-decisions.md) | Record architecture decisions | Accepted | Markdown ADRs in `docs/adr/`, sequential `NNN`, superseded via new ADR |
| [001](001-modular-monolith-with-worker-entrypoint.md) | Modular monolith with a worker entrypoint | Accepted | One NestJS codebase, `main.ts` (HTTP) + `worker.ts` (BullMQ); lint-enforced module boundaries |
| [002](002-monorepo-pnpm-turborepo.md) | Monorepo with pnpm workspaces and Turborepo | Accepted | `apps/web`, `apps/api`, `packages/contracts` in one repo; turbo task cache |
| [003](003-postgres-fts-trigram-over-search-engine.md) | PostgreSQL FTS + trigram instead of a search engine | Accepted | Generated `tsvector` + `pg_trgm`/`unaccent` GIN indexes; no Elasticsearch/Meilisearch |
| [004](004-zod-contracts-shared-fe-be.md) | Zod contracts shared between frontend and backend | Accepted | Zod 4 schemas in `packages/contracts`, `nestjs-zod` v5, OpenAPI generated |
| [005](005-job-vs-sourcejob-and-visibility.md) | Job vs SourceJob, and job visibility | Accepted | `SourceJob.jobId` → one canonical `Job`; `PUBLIC`/`PRIVATE` with `ownerId` CHECK |
| [006](006-transactional-outbox.md) | Transactional outbox (from R1) | Accepted | R0 sync side effects in-transaction; R1 outbox → BullMQ via claim/commit/publish relay |
| [007](007-auth-better-auth.md) | Authentication with Better Auth | Accepted | Better Auth + `@thallesp/nestjs-better-auth`; R0 Google only; UUID v7 ids; verified-email linking |
| [008](008-session-cookie-csrf-domain-topology.md) | Session cookies, CSRF and domain topology | Accepted | `app.`/`api.` same-site (SPA on Cloudflare Pages custom domain); `__Host-` Lax cookies; Origin check; CORS allowlist |
| [009](009-url-capture-ssrf-policy.md) | URL capture SSRF policy | Accepted | R1: allow-only public unicast, connect to validated IP, isolated egress, redirect rules |
| [010](010-document-upload-and-parsing-sandbox.md) | Document upload and parsing sandbox | Accepted | Presigned PUT with signed length/type (R2 has no POST policy), quarantine, parsing in limited child process |
| [011](011-hosting-vps-compose-terraform.md) | Hosting: Hetzner VPS + Compose + Caddy + Terraform | Accepted | VPS for API + Cloudflare Pages for SPA, IaC; AWS (~$60–100/mo) rejected |
| [012](012-postgresql-18-uuidv7.md) | PostgreSQL 18 with native UUID v7 | Accepted | PG 18 `uuidv7()` defaults for all PKs |
| [013](013-observability-prometheus-grafana-sentry.md) | Observability: Prometheus + Grafana, Sentry, OTel later | Accepted | pino + Sentry; Prometheus/Grafana as code in R1; OTel traces in R2 |
| [014](014-ephemeral-demo-users.md) | Ephemeral demo users | Accepted | Per-visitor demo user, 24 h TTL; no uploads/URL capture/email; AI capped |
| [015](015-data-retention-and-deletion.md) | Data retention and account deletion | Accepted | Per-storage retention table; hard delete ≤ 24 h via FK rules + pipeline |
| [016](016-prisma-7-with-raw-sql-features.md) | Prisma 7 with raw SQL for Postgres features | Accepted | `prisma.config.ts`, adapter-pg, `Unsupported` types, partial-index preview, drift check in CI |
| [017](017-ai-provider-abstraction-and-task-registry.md) | AI provider abstraction and task registry | Accepted | `AIProvider` + `defineTask` executor; provider chosen in M4 via golden set |
| [018](018-deterministic-matching-v1.md) | Deterministic matching v1 | Accepted (R2) | Weighted explainable components with confidence and hard filters |
| [019](019-exchange-rates-nbu.md) | Exchange rates from NBU | Accepted (R2) | NBU rates (twice daily, last-known fallback) for USD/month salary normalisation; API verified in R2 |
| [020](020-docs-language-and-structure.md) | Documentation language and structure | Accepted | Spec split into `docs/spec/*.md` (Ukrainian, English overview); code/README/ADR in English |
| [021](021-url-capture-via-worker-queue.md) | URL capture via a worker queue | Accepted | R1: API enqueues `capture` job (stable jobId) and awaits ≤ 6 s; worker calls safe-fetcher; API stays off `fetch-rpc`; timeout → 504 `CAPTURE_TIMEOUT` |
| [022](022-portfolio-mode-deploy-ready-not-hosted.md) | Portfolio mode: deploy-ready, not hosted | Accepted | No hosted env in R0/R1 (supersedes D-01); images/compose.prod/Terraform/deploy workflow validated in CI only; local + Codespaces + demo sign-in; hosting options documented |
| [023](023-sast-semgrep-while-private.md) | SAST: Semgrep CE while the repository is private | Accepted | Semgrep CE (community rules, `--metrics=off`, findings fail) as R0 SAST gate; CodeQL only when the repo is public (not free for private repos) |
| [024](024-node-26-lts-and-pnpm-without-corepack.md) | Node.js 26 LTS runtime; pnpm without corepack | Accepted | `engines.node ^26.13.1` (CI reads it), `@types/node` 26; pnpm via `npm i -g pnpm` + `packageManager` pin + `pmOnFail: download`, CI `pnpm/action-setup`; Prisma 7 on 26 accepted on test evidence |
