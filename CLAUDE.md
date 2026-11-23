# Applyra

Daily Telegram digest of relevant vacancies from Ukrainian job sites, filtered and ranked by the owner's profile,
run by GitHub Actions cron (no hosting, no DB). Solo developer. Source of truth: `docs/spec.md` + `docs/adr/`.

## Orientation

1. `docs/CONTEXT.md` first — status, repo map, sources, commands, gotchas.
2. `docs/spec.md` for behaviour (pipeline, profile format, state, schedule, non-goals).
3. Area rules load automatically from `.claude/rules/`.
4. After changing structure, commands or decisions — update `docs/CONTEXT.md` (terse).

## Stack

pnpm workspaces · Node 26 ESM, TypeScript strict (`noUncheckedIndexedAccess`), run directly by Node
(type stripping: `.ts` imports, erasable syntax only) · Vitest · global `fetch` · GitHub Actions.
Packages: `@applyra/digest` (`apps/digest`), `@applyra/config` (tsconfig + ESLint).

## Commands

- `pnpm check` (= lint, format:check, typecheck, test) — must be green before a task is done
- `pnpm format:check` · `pnpm audit --audit-level=high` (CI also: gitleaks, osv-scanner, actionlint, Semgrep)
- `pnpm --filter @applyra/digest dry-run` — fake source + example profile, prints the digest, sends nothing
- `pnpm --filter @applyra/digest start -- [--dry-run] [--source=a,b] [--profile=path]`

## Rules

- Public feeds/APIs only. No scraping that bypasses ToS, robots rules, auth or CAPTCHA; no logged-in sessions; one request per feed per run.
- Secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, LLM keys) only via env / GitHub secrets; never logged, never in errors, fixtures or the profile. Never read or edit `.env*` (except `.env.example`).
- No personal data in the repo (`profile.json` = preferences only).
- Tests for every parser, normalizer, filter rule, dedup and format change — test-first; fixtures are trimmed, anonymised recorded feeds. No network in tests.
- Pure logic (normalize, dedup, filter, format) has no I/O; I/O only in `sources/`, `state.ts`, `telegram.ts`, `workers-ai.ts`, `main.ts`.
- Idempotent runs: mark a vacancy sent only after its message was delivered.
- No `any`, `@ts-ignore`, `as unknown as`, or non-null `!` without a one-line justification comment.
- Smallest change; prefer deleting to adding. No new dependency without stating why.
- Behaviour change → update `docs/spec.md` (+ an ADR for decisions). Conflict with the spec → stop and ask.

## Git & workflow

- Branches `feat/*`, `fix/*`, `chore/*` from `main`; Conventional Commits; one logical change per PR.
- Never commit, push, force-push or delete branches without the owner's explicit approval in this session.
- Light flow: implement (`lead-developer` or main session, test-first) → `/review` (`code-reviewer`, `security-reviewer`) → `/verify` → `/ship`. `/bugfix` for bugs, `/adr` for decisions, `test-writer` / `qa-lead` when useful.
