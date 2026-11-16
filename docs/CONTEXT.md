# Applyra — Working Context

> Living map for AI agents and humans. Goal: orient in a new session without re-reading code or the whole SPEC.
> Keep it terse and current. Update in the same commit that changes structure, modules, commands, or decisions.
> Last updated: 2026-11-16

## 1. Status
- Phase: **pre-M0** — repository holds SPEC + AI tooling config only. No application code yet.
- Done: AI tooling (CLAUDE.md, rules, agents, skills, hooks, plugins) — see `docs/AI-WORKFLOW.md`.
- Next: SPEC review → scaffold monorepo (M0: monorepo, CI, compose, auth, staging "hello") → then `npx playwright init-agents --loop=claude`.
- Current release target: **R0 "Tracker for myself"** (SPEC §4).

## 2. Repo map
Planned layout (confirm at scaffold, then mark ✅):
```
apps/
  web/                 React + Vite SPA            (feature folders: src/features/<feature>/)
  api/                 NestJS: src/main.ts (HTTP) + src/worker.ts (BullMQ)
    src/modules/<name>/  index.ts (public API) · *.controller.ts · *.service.ts · *.repository.ts · *.domain.ts
    prisma/            schema.prisma · migrations/ (applied = immutable)
packages/
  contracts/           Zod schemas + inferred types shared by web and api (single source for DTOs, enums, JSONB shapes)
  config/              shared tsconfig / eslint / prettier (if needed)
docs/
  SPEC.md · CONTEXT.md (this file) · adr/NNN-title.md
.claude/
  rules/   path-scoped rules (auto-load by file glob)
  agents/  security-reviewer · code-reviewer · ui-reviewer · test-writer
  skills/  new-endpoint · prisma-migration · adr · ai-task · shadcn (vendored, skills-lock.json)
  hooks/   guard-paths.mjs (blocks .env / applied migrations) · format.mjs (prettier on edited file)
```

## 3. Modules (SPEC §6.3)
| Module | Release | Status |
|---|---|---|
| auth, users, jobs, applications, reminders | R0 | — |
| notifications, import-export | R0/R1 | — |
| profile, skills, documents, companies, analytics, outbox, audit | R1 | — |
| search, ai | R1–R3 | — |
| ingestion, dedup, matching | R2 | — |
Status legend: — not started · 🚧 in progress · ✅ done (link to key files when done).

## 4. Key decisions (short; details in ADRs)
- Modular monolith + worker entrypoint in one codebase (D10, ADR-001).
- Zod contracts shared FE/BE; OpenAPI generated from them (ADR-004).
- Postgres FTS + pg_trgm instead of a search engine (ADR-003).
- `Job` (canonical, PUBLIC/PRIVATE visibility) vs `SourceJob` (publication) (D8, D9, ADR-005).
- Transactional outbox for async cross-module effects (D11, ADR-007).
- Matching v1 deterministic; semantic (pgvector) only in R3 (D4).
- AI: `AIProvider` + `defineTask` registry, structured output only, no tools in R3 (SPEC §12).
- Hosting: open (Q3).

## 5. Conventions already fixed
- API: REST `/api/v1`, camelCase, cursor pagination `{ items, nextCursor }`, error shape in SPEC §10.1, `Idempotency-Key` on retryable mutations.
- IDs: UUID v7. Time: `timestamptz` UTC; user timezone stored separately. Money: integer + `currency CHAR(3)` + `period`.
- JSONB only for event payloads, raw source data, matching breakdown, typed config — each with a Zod schema in contracts.

## 6. Gotchas / learned the hard way
_(append one line per non-obvious discovery: what, where, why)_
- pnpm is not installed globally on the dev machine yet — enable via `corepack enable` at scaffold.
- Windows dev machine: hooks are Node scripts (no bash/jq dependency).

## 7. SPEC index (section → topic)
Use: `grep -n "^### 8.3" docs/SPEC.md` then read ~40–80 lines. Never load the whole file.
| § | Topic | § | Topic |
|---|---|---|---|
| 1–2 | goals, persona, JTBD | 10.1 | API conventions, error shape |
| 3 | scope decisions D1–D12 | 10.2 | endpoints by release |
| 4 | releases R0–R3 scope + exit criteria | 11.1–11.2 | auth, cookies, CSRF, IDOR |
| 5.1–5.3 | auth, job capture, applications CRM | 11.3 | file uploads |
| 5.4–5.5 | reminders, interviews | 11.4 | URL capture SSRF policy |
| 5.6–5.8 | profile, documents, jobs/discover | 11.5–11.6 | untrusted content, logs redaction |
| 5.9–5.10 | matching, AI assistant | 12.1–12.5 | AI provider, tasks, budget, injection, evals |
| 5.11–5.14 | notifications, dashboard, analytics, privacy | 13 | UI/UX, navigation, screens, a11y |
| 6.1–6.4 | architecture, module rules, outbox events | 14 | testing levels, CI gates |
| 7 | tech stack | 15–16 | infra/deploy, observability |
| 8.1 | data principles | 17 | portfolio / CV |
| 8.2 | logical data model (Prisma-like, long) | 18 | milestones, backlog epics, DoD |
| 8.3–8.5 | matching v1, salary normalization, dedup | 19–21 | risks, open questions Q1–Q7, ADR list |
| 9 | ingestion adapters (R2) | 22 | rules for AI agent |
