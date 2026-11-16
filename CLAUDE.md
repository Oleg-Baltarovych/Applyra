# Applyra

Personal job-search workspace: job capture, application CRM (Kanban), reminders, explainable matching, AI helpers.
Portfolio-grade, solo developer. Source of truth: `docs/spec/*.md` (split spec v2.1, Ukrainian; start at `00-overview.md`) + `docs/adr/`. Read only the file you need.

## Orientation (read this before exploring)

1. `docs/CONTEXT.md` — current status, repo map, module status, decisions, gotchas. Read it first; it replaces broad exploration.
2. Need a spec detail? Pick the file from the index in `docs/CONTEXT.md` §7, then grep inside it
   (`grep -n "^## " docs/spec/09-security-privacy.md`) and read only that section.
3. Area rules load automatically from `.claude/rules/` when you touch matching files. Do not duplicate them here.
4. At the end of every task that changes structure, modules, commands or decisions — update `docs/CONTEXT.md` (keep it terse).

## Stack (fixed; versions in `docs/spec/04-architecture.md`)

pnpm workspaces + Turborepo · TypeScript strict (`noUncheckedIndexedAccess`) · `apps/web` React + Vite + TanStack Query + Tailwind/shadcn ·
`apps/api` NestJS (HTTP `main.ts` + BullMQ `worker.ts`, one codebase) · Prisma 7 + PostgreSQL 18 · Redis-compatible Valkey 9 (compose service `redis`) · `packages/contracts` Zod schemas shared FE/BE ·
Better Auth · Vitest, Supertest, Testcontainers, Playwright, MSW.

## Commands

> Keep only non-obvious ones. Packages: `@applyra/{web,api,contracts,config,e2e}`.

- `pnpm lint && pnpm typecheck && pnpm test` — must be green before reporting a task done (scope with `--filter <pkg>`)
- `pnpm build` · `pnpm dev` (turbo; for now only the `contracts` tsup watcher — web/api dev arrive in M0-02/M0-12)
- `pnpm format:check` — Prettier (docs/ and .claude/ are ignored)
- `pnpm --filter @applyra/config test` — boundary-rule test (lints `packages/config/test/fixtures/boundaries/`)
- `pnpm --filter @applyra/e2e e2e` — Playwright; not part of `pnpm test`
- `docker compose up -d` — postgres, redis, minio, mailpit (from M0-04)

## Non-negotiable rules

- If a task conflicts with the spec — stop and ask. Behaviour/architecture changes go into the spec file + an ADR (`docs/adr/NNN-title.md`).
- Stay inside the task scope. No new dependency without stating why (in the commit/PR body).
- Module boundaries: import another module only via its `index.ts`.
- Every query on user-owned data is scoped by `userId` (`findOwned*`). Foreign resource → 404, never 403. Every private endpoint gets an IDOR test.
- No UI for features without a working backend; no mock data in production code.
- No `any`, `@ts-ignore`, `as unknown as`, or non-null `!` without a one-line justification comment.
- Never edit applied Prisma migrations, never read or edit `.env*` (except `.env.example`).

## Engineering principles (adapted from unclebob/ub-mode)

- Domain/service logic: write the failing test first and see it fail for the expected reason. Skip test-first for DI wiring, Nest modules, DTOs, schema files.
- Tests assert observable behaviour through public APIs. A test that would pass if every function returned nothing is deleted.
- Validate external data once at the boundary (Zod via `nestjs-zod` / RHF), trust it inside. Business rules live in pure `*.domain.ts` functions.
- Make illegal states unrepresentable (discriminated unions, enums from contracts).
- Smallest change that solves the problem; prefer deleting to adding; redesign instead of bolting on.
- Bugs: reproduce with a test, fix the cause. A guard that only hides the crash is not a fix.
- Jobs, consumers and retryable mutations are idempotent (stable `jobId` / dedup key / `Idempotency-Key`).

## Git

- Branches `feat/*`, `fix/*`, `chore/*` from `main`; Conventional Commits; one logical change per commit/PR, referencing the FR ID / spec file.
- Never commit, push, force-push, or delete files/branches without the user's explicit approval in this session.

## Team & workflow (details: `docs/AI-WORKFLOW.md`)

- `architect` designs (plans in `docs/plans/`, ADRs, spec/CONTEXT) — never code. `lead-developer` implements approved plans.
- `test-writer` writes tests. Read-only reviewers: `code-reviewer`, `security-reviewer`, `ui-reviewer`. `qa-lead` gives final acceptance. E2E: `playwright-test-{planner,generator,healer}`.
- Flow commands: `/feature` (plan → approve → implement → review → verify → accept) · `/plan` · `/implement` · `/review` · `/verify` · `/ship` · `/bugfix` · `/e2e` · `/security-audit` (pre-release only) · `/sync-context`.
- Procedures: `/new-endpoint`, `/prisma-migration`, `/adr`, `/ai-task`.
- Non-trivial work (new module, schema change, cross-module flow) goes through a plan first. Small fixes may skip the architect.
