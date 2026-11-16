# Applyra — Overview

> Applyra spec v2.1 · Area: public summary and entry point · Related: all files in `docs/spec/`

## 1. What Applyra is

Applyra is a personal job-search workspace: capture vacancies from any source in seconds, track every application
in a CRM (Kanban / table / timeline), never miss a follow-up, and — in later releases — see explainable match
scores and get AI help with routine writing tasks.

Positioning: **"Your job search, under control."** Applyra is not another job board. It is about the pipeline and
decisions, not about the number of vacancies.

## 2. Goals (in priority order)

1. **Portfolio.** A production-grade full-stack project: deployed, with a demo, tests, CI, ADRs and a clear README.
   It demonstrates skills that CRUD projects do not show: ingestion, queues, deduplication, search, AI with
   structured output, security, observability.
2. **Dogfooding.** The author is job hunting right now. R0 must replace his Google Sheet within 3–4 weeks.
3. **Commercial potential.** Kept as an option; it does not influence decisions before R3.

## 3. Non-goals

- No auto-apply, ever, without a separate explicit decision.
- No scraping that bypasses ToS, authentication, CAPTCHA or anti-bot measures.
- No microservices, no separate search cluster, no native mobile apps.
- No multi-tenant teams or recruiter accounts.
- No billing or pricing in this spec.

## 4. Persona

Middle/Senior IT professional from Ukraine looking for remote work. Uses 3–5 platforms (Djinni, DOU, robota.ua /
work.ua, LinkedIn, company career pages). Many opportunities are inbound (a recruiter writes in Djinni, LinkedIn or
Telegram), often without a vacancy page. Salaries mostly in USD/month. Main pain: **ghosting** — silence after
applying and losing track of where and when they applied. Keeps 1–3 CV versions.

## 5. Release map

| Release | Name | One line |
|---|---|---|
| R0 | Tracker for myself | Google sign-in (allowlist), applications CRM (Kanban/table/detail/timeline, undo), manual job form + paste text, next actions + Today/Overdue (computed on read, no worker), CSV import/export, security headers, one deployed environment on the future prod host (real data, allowlist = author) with nightly backups; synthetic staging from R1 |
| R1 | Public MVP / portfolio-ready | Outbox + worker, URL capture (JSON-LD + `extract-job` LLM with budgets), stale hints, contacts, interviews, profile & skills, CV documents, job search (no salary filter), dashboard, base analytics, notification centre + email reminders, email+password auth, ephemeral demo, Prometheus/Grafana, production |
| R2 | Discover & Match | Public-API ingestion (Greenhouse, Lever, Ashby, DOU RSS), dedup, salary normalization (NBU rates) + salary filter, deterministic explainable matching, saved searches, OpenTelemetry |
| R3 | AI Assistant | Analyze vacancy, CV tailoring suggestions, message drafts, recruiter replies, interview prep, CV parsing, embeddings, evals |

Details and timeline: `02-releases.md`.

## 6. Architecture in 5 bullets

- **Modular monolith** in NestJS with enforced module boundaries; one codebase, two entrypoints (HTTP API + BullMQ worker).
- **PostgreSQL 18** as the single store for data and search (FTS + trigram, later pgvector); **Redis** for queues, rate limits, cache.
- **Transactional outbox** (from R1) for reliable domain events; R0 does side effects synchronously in the same transaction.
- **Shared Zod contracts** between React SPA and API; OpenAPI generated from them.
- **AI behind an `AIProvider` abstraction** with a task registry, schema-enforced structured output, budgets and evals; AI only proposes, the user confirms.

## 7. Stack

TypeScript (strict) · pnpm + Turborepo · React + Vite + TanStack Query + Tailwind/shadcn · NestJS · Prisma 7 ·
PostgreSQL 18 · Redis-compatible (Valkey 9) + BullMQ · Better Auth · S3-compatible storage · Vitest, Testcontainers, Playwright ·
GitHub Actions · Docker Compose on a VPS (Hetzner) + Caddy + Terraform · SPA on Cloudflare Pages · Prometheus/Grafana, Sentry.
Exact versions: `04-architecture.md` §7.

## 8. Spec files

| File | Purpose |
|---|---|
| `00-overview.md` | This summary (English) |
| `01-product.md` | Goals, persona, jobs-to-be-done, scope decisions, portfolio/CV positioning, risks, resolved decisions |
| `02-releases.md` | Releases R0–R3, milestones and timeline, backlog epics, Definition of Done |
| `03-functional.md` | Functional requirements `FR-<AREA>-NN` with release tags and acceptance criteria |
| `04-architecture.md` | Modules, boundaries, entrypoints, outbox and domain events, tech stack with versions |
| `05-data-model.md` | Entities, enums, FKs/onDelete, indexes, raw SQL migrations |
| `06-api.md` | REST conventions, error codes, endpoint list per release |
| `07-ai.md` | AIProvider, task registry, executor, context/budget, prompt injection, evals |
| `08-ingestion-matching.md` | Source adapters, normalization, salary, dedup, matching algorithm |
| `09-security-privacy.md` | Auth/session rules, IDOR, SSRF, files, headers/CSP, data retention, audit |
| `10-frontend-ux.md` | Navigation, screens, states, accessibility, design tokens |
| `11-testing.md` | Test levels, IDOR suite, CI gates, fixtures |
| `12-infra-ops.md` | Environments, hosting, deploy, backups, observability, NFRs |

## 9. How to read

- **Humans:** read this file, then `01-product.md` and `02-releases.md`. Open the rest by topic.
- **AI coding agents:** read `00-overview.md`, then **only** the file that covers your task (e.g. a new endpoint →
  `06-api.md` + the relevant `FR-*` in `03-functional.md`). Each fact lives in exactly one file; follow
  "див. `<file>` §N" references instead of guessing.
- Prose in files 01–12 is Ukrainian; identifiers, code and this overview are English.
- If code contradicts the spec, fix the code or change the spec via an ADR (`docs/adr/`) — never diverge silently.
- Requirement IDs (`FR-APP-03`) and review IDs (`P-04`) are stable; reference them in issues, commits and PRs.

## Зміни відносно v2.0

- Spec split into `docs/spec/*.md` (v2.1); `docs/SPEC.md` v2.0 remains in git history.
- R0 cut to ~45–55 h (3–4 weeks); hosting = VPS; PostgreSQL 18; Prometheus/Grafana in R1; ephemeral demo
  (decisions in `docs/SPEC-REVIEW.md` §4).
