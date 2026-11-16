# Applyra — Working Context

> Living map for AI agents and humans. Goal: orient in a new session without re-reading code or the whole spec.
> Keep it terse and current. Update in the same commit that changes structure, modules, commands, or decisions.
> Last updated: 2026-11-16

## 1. Status
- Phase: **pre-M0** — repository holds the spec (v2.1, `docs/spec/`), ADRs and AI tooling config. No application code yet.
- Done: AI tooling (see `docs/AI-WORKFLOW.md`); spec review (`docs/SPEC-REVIEW.md`) → split spec v2.1 + ADR 000–021; MVP plan (`docs/plans/mvp.md`, `docs/plans/mvp-tasks.md`); pre-coding consistency pass over spec/ADRs.
- Next: GitHub milestones/issues → M0-01 (M0 scaffold: monorepo, CI, compose, auth, deploy "hello" to the R0 environment on the future prod host; spike: NestJS 12 / BullMQ 6 / nestjs-zod / Better Auth compatibility).
- Current release target: **R0 "Tracker for myself"** (`docs/spec/02-releases.md`).

## 2. Repo map
Planned layout (confirm at scaffold, then mark ✅):
```
apps/
  web/                 React 19 + Vite SPA, React Router 8 data mode (feature folders: src/features/<feature>/)
  api/                 NestJS: src/main.ts (HTTP) + src/worker.ts (BullMQ, from R1)
    src/modules/<name>/  index.ts (public API) · *.controller.ts · *.service.ts · *.repository.ts (only Prisma access) · *.domain.ts
    prisma/            schema.prisma (source of truth for columns once it exists) · migrations/ (applied = immutable)
packages/
  contracts/           Zod 4 schemas + inferred types shared by web and api
  config/              shared tsconfig / eslint / prettier (if needed)
e2e/                   Playwright: seed.spec.ts, specs/ (test plans)
docs/
  spec/00…12-*.md (spec v2.1) · adr/ (000–021 + README index) · plans/ · CONTEXT.md · AI-WORKFLOW.md · SPEC-REVIEW.md (history)
.claude/
  rules/   path-scoped rules (auto-load by file glob)
  agents/  architect · lead-developer · test-writer · qa-lead · code-/security-/ui-reviewer · playwright-test-*
  skills/  flow commands (feature, plan, implement, review, verify, ship, bugfix, e2e, security-audit, sync-context)
           procedures (new-endpoint, prisma-migration, adr, ai-task) · shadcn (vendored, skills-lock.json)
  hooks/   guard-paths.mjs (blocks .env / applied migrations) · format.mjs (prettier on edited file)
.mcp.json              playwright-test MCP (works once @playwright/test is installed)
```

## 3. Modules (`docs/spec/04-architecture.md` §3)
| Module | Release | Status |
|---|---|---|
| auth, users, jobs, applications, reminders, import-export | R0 | — |
| notifications, profile, skills, documents, analytics, ai (extract-job), outbox, audit | R1 | — |
| ingestion (incl. dedup, FX), matching | R2 | — |
| ai (other tasks, embeddings) | R3 | — |
Status legend: — not started · 🚧 in progress · ✅ done (link key files when done). companies/search live in `jobs`; dedup in `ingestion`.

## 4. Key decisions (details in `docs/adr/README.md`)
- Modular monolith + worker entrypoint (001); pnpm + Turborepo (002); Postgres FTS + trigram (003); Zod contracts FE/BE (004).
- R0 side effects synchronous in the same transaction; outbox + BullMQ from R1 (006).
- Better Auth, R0 = Google OAuth only, UUID v7 ids (007); `app.`/`api.` same-site, `__Host-` cookies (008).
- PostgreSQL 18 + native `uuidv7()` (012); Prisma 7 + raw SQL features, drift check in CI (016).
- Hetzner VPS + Compose + Caddy + Terraform; SPA on Cloudflare Pages custom domain (011). R0: no staging — one environment on the future prod host (real data, allowlist = author); synthetic staging from R1 (M5-20).
- Queue/cache store: Valkey 9 (compose service `redis`, image `valkey/valkey:9`, also in Testcontainers).
- URL capture (R1): API enqueues `capture` job, awaits ≤ 6 s; worker → safe-fetcher; API off `fetch-rpc` (021).
- R0 schema = unmarked items of `05-data-model.md` §4.1–4.2; `// R1`/`// R2`/`// R3` items come with their release's migration.
- Prometheus + Grafana (R1, as code) + Sentry; OTel R2 (013). Ephemeral demo users (014). Retention & deletion across stores (015).
- Docs: spec Ukrainian (overview English), code/README/ADR English (020).

## 5. Conventions already fixed
- API: REST `/api/v1`, camelCase, keyset cursor, error shape + code catalogue, `Idempotency-Key` → `06-api.md`.
- IDs UUID v7 · `timestamptz` UTC + user timezone in `UserSettings` · money = integer + currency + period → `05-data-model.md`.
- Requirements are referenced by FR ID (`FR-APP-03`) from `03-functional.md`; plans, commits and PRs cite FR IDs.

## 6. Gotchas / learned the hard way
_(append one line per non-obvious discovery: what, where, why)_
- `05-data-model.md` is ~1250 lines (schema code): never read it whole — `grep -n "model <Name>"` and read that block. After scaffold `schema.prisma` is the source of truth and 05 keeps principles only.
- To verify at scaffold (written from docs, not yet compiled): partial `@@unique(where:)` preview syntax, `ops: raw("gin_trgm_ops")`, GIN on `Unsupported("tsvector")`, NestJS 12 peer deps of nestjs-zod / `@thallesp/nestjs-better-auth`, `@nestjs/bullmq` with BullMQ 6.
- pnpm is not installed globally yet — enable via `corepack enable` at scaffold.
- Windows dev machine: hooks are Node scripts (no bash/jq). Git Bash heredocs with quotes break — write scripts to files.
- Project agents/skills load only when the Claude Code session starts in the `Applyra` folder.
- `.claude/hooks/guard-paths.mjs` blocks Read/Edit/Write of `.env*` (except `.env.example`) and any Bash command mentioning a `.env` file — false positives possible, rephrase or ask the user; migration files are immutable once tracked by git (untracked `--create-only` migrations may be edited).
- `/review` and `/verify` are model-invocable on purpose (called from `/feature`, `/implement`, `/bugfix`, `/ship`).
- BullMQ custom `jobId` must not contain `:` or be all digits — outbox uses `<eventId>_<consumer>` (04 §5.2).
- Playwright agents were generated with Playwright 1.65.1; after a major upgrade re-run `npx playwright init-agents --loop=claude`, then re-apply the short descriptions and `e2e/` paths.

## 7. Spec index (`docs/spec/`)
Read `00-overview.md` once, then only the file you need; grep `^## ` for its sections.
| File | Topic |
|---|---|
| 00-overview.md | English summary, release map, file guide |
| 01-product.md | goals, persona, scope decisions D1–D12, portfolio/CV, risks, resolved questions |
| 02-releases.md | R0–R3 scope, milestones, epics E01–E13, Definition of Done |
| 03-functional.md | FR-<AREA>-NN requirements with acceptance criteria |
| 04-architecture.md | style, diagrams, module map, boundaries, outbox, monorepo, pinned stack versions |
| 05-data-model.md | Prisma 7 schema by release, FK/cascade table, raw SQL, retention (long — grep) |
| 06-api.md | conventions, error codes, idempotency, limits, endpoints by release |
| 07-ai.md | AIProvider, task registry, budgets, cache, prompt injection, evals |
| 08-ingestion-matching.md | R2: adapters, dedup, salary/FX, matching v1 |
| 09-security-privacy.md | threat model, authn/z, SSRF, uploads, headers/CSP, data stores & retention, OWASP map |
| 10-frontend-ux.md | frontend architecture, tokens, screens, navigation, a11y, hotkeys |
| 11-testing.md | test pyramid per release, IDOR suite, CI gates |
| 12-infra-ops.md | environments, hosting, backups, migrations, CI/CD, observability |
