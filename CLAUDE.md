# Applyra

Personal job-search workspace: job capture, application CRM (Kanban), reminders, explainable matching, AI helpers.
Portfolio-grade, solo developer. Source of truth: `docs/SPEC.md` (Ukrainian, ~1350 lines — never read it whole).

## Orientation (read this before exploring)
1. `docs/CONTEXT.md` — current status, repo map, module status, decisions, gotchas. Read it first; it replaces broad exploration.
2. Need a SPEC detail? Find the section in the index in `docs/CONTEXT.md`, then read only that range
   (`grep -n "^### 11.4" docs/SPEC.md`, then read ~40 lines from there).
3. Area rules load automatically from `.claude/rules/` when you touch matching files. Do not duplicate them here.
4. At the end of every task that changes structure, modules, commands or decisions — update `docs/CONTEXT.md` (keep it terse).

## Stack (fixed, see SPEC §7)
pnpm workspaces + Turborepo · TypeScript strict (`noUncheckedIndexedAccess`) · `apps/web` React + Vite + TanStack Query + Tailwind/shadcn ·
`apps/api` NestJS (HTTP `main.ts` + BullMQ `worker.ts`, one codebase) · Prisma + PostgreSQL 16 · Redis · `packages/contracts` Zod schemas shared FE/BE ·
Better Auth · Vitest, Supertest, Testcontainers, Playwright, MSW.

## Commands
> Not scaffolded yet. Fill in real commands here once they exist (keep only non-obvious ones).
- `docker compose up -d` — postgres, redis, minio, mailpit
- `pnpm dev` — web + api + worker via turbo
- `pnpm lint && pnpm typecheck && pnpm test` — must be green before reporting a task done (scope with `--filter <pkg>`)

## Non-negotiable rules
- If a task conflicts with SPEC — stop and ask. Behaviour/architecture changes go into SPEC + an ADR (`docs/adr/NNN-title.md`).
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
- Branches `feat/*`, `fix/*`, `chore/*` from `main`; Conventional Commits; one logical change per commit/PR, referencing the SPEC section.
- Never commit, push, force-push, or delete files/branches without the user's explicit approval in this session.

## Agents & skills in this repo
Reviewers (read-only): `security-reviewer`, `code-reviewer`, `ui-reviewer`. Writer: `test-writer`.
Skills: `/new-endpoint`, `/prisma-migration`, `/adr`, `/ai-task`. Use reviewers before declaring a feature done.
