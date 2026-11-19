# Applyra — Working Context

> Living map for AI agents and humans. Terse and current; update in the same change that alters structure,
> commands or decisions. Last updated: 2026-11-19 (pivot to vacancy digest, ADR 026)

## 1. Status

Pivot done (ADR 026): one package `apps/digest`. Pipeline, profile filter/score, dedup, Telegram format/send,
state file, CLI and `digest.yml` cron work and are tested; **no real source adapter yet** (only `fake`,
dry-run only). Next: DOU + Djinni RSS adapters (spec §2) with recorded fixtures.
Pre-pivot CRM (spec v2.1, ADRs 000–025, plans, api/web code) → git tag `archive/crm-plan-v0`.

## 2. Repo map

- `apps/digest/` — `@applyra/digest`, Node 26 ESM TS run directly by Node (type stripping, no build)
  - `src/main.ts` pipeline `run()` + CLI · `types.ts` Vacancy/RawItem · `text.ts` keyword matcher, language, years
  - `src/sources/source.ts` `Source` interface, `FakeSource`, `SAMPLE_ITEMS` · `normalize/` url + RawItem→Vacancy
  - `src/dedup.ts` keys/state ops · `filter.ts` profile parse + evaluate/rank · `format.ts` Telegram HTML · `telegram.ts` · `state.ts`
  - `profile.json` (owner, committed, no personal data) · `profile.example.json` · `test/` (Vitest)
- `packages/config/` — shared `tsconfig.base.json` + ESLint flat config (+ a test that the strict rules fire)
- `.github/workflows/` — `ci.yml` (lint, typecheck, unit, gitleaks, audit, osv-scanner, actionlint), `sast.yml` (Semgrep), `digest.yml` (daily cron)
- `docs/spec.md` (source of truth) · `docs/adr/` (026+)

## 3. Sources

| Source | Status |
|---|---|
| fake | ✅ dry-run only (`--source=fake`) |
| DOU RSS | ⏳ next — id from link, fields packed in the title |
| Djinni RSS | ⏳ next — guard against unfiltered feed (100 items / mixed category) |

## 4. Commands

- `pnpm lint && pnpm typecheck && pnpm test` · `pnpm format:check` · `pnpm audit --audit-level=high`
- `pnpm --filter @applyra/digest dry-run` — fake source + example profile, prints the digest
- `pnpm --filter @applyra/digest start -- --dry-run --source=fake` — same with the owner profile
- real run: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DIGEST_SOURCES` in env → `pnpm --filter @applyra/digest start`
- actionlint: `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo:ro" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color`
- renovate config: `npx --yes --package renovate@latest -- renovate-config-validator --strict`

## 5. Key decisions

- 026 Pivot to a daily Telegram vacancy digest on GitHub Actions cron, no hosting/DB; state in Actions cache.

## 6. Supply chain

- `minimumReleaseAge: 1440` (strict) and `allowBuilds` (only esbuild) in `pnpm-workspace.yaml`; Renovate weekly, 3-day age.
- Audit exception policy: never `|| true`. A temporary exception = `auditConfig.ignoreGhsas` (GHSA + reason + expiry
  comment) mirrored in `osv-scanner.toml` with `effectiveUntil`. Current: picomatch 4.0.7 GHSA-fc5q-39xc-vjpf until 2026-12-15.

## 7. Gotchas

- Node runs `.ts` directly: imports need the `.ts` extension, only erasable TS syntax (no enums/namespaces/parameter properties) — enforced by tsconfig `erasableSyntaxOnly` + `allowImportingTsExtensions`.
- `pnpm --filter … start -- --flag` passes a literal `--` to the script; the CLI scans argv for flags, so both forms work.
- Regex `\b` is ASCII-only even with the `u` flag: it never matches next to Cyrillic ("до $2000" bug). Use `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` (see `text.ts`).
- Telegram: the bot token is in the request URL → errors carry only status + `description`; network errors are re-thrown without the original message.
- `digest.yml` job uses Environment `digest` (restricted to main) — the Telegram secrets are environment secrets there, not repo secrets.
- Telegram 400 with a content error (too long / can't parse entities / empty) → that message's vacancies are quarantined (marked sent, `rejected` in the summary) and the run continues; any other error (network, 5xx, 401, 400 "chat not found") fails fast. A state-save error never masks the send error; a load error never saves.
- Dry run wraps output in `::stop-commands::<uuid>` … `::<uuid>::` and indents it: feed text must not become workflow commands. normalize collapses CR/LF in single-line fields; source errors go through `redact()` (urls without query/userinfo, ≤ 300 chars).
- format.ts budgets are in ESCAPED chars (`escapeFit`); a block that still does not fit falls back to the bare title.
- Actions cache keys are immutable → save under `digest-state-<run_id>-<attempt>`, restore by prefix `digest-state-`; entries idle 7 days are evicted. Schedules run only from the default branch.
- Node 26 LTS, pnpm 11 via `npm i -g pnpm` (self-switches to `packageManager` via `pmOnFail: download`). TS 6: `types` defaults to `[]` → set `"types": ["node"]` per package.
- Windows/Git Bash: heredocs with quotes break and the guard hook blocks any command text mentioning `.env` — write files with the editor tool instead.
- `.claude/settings.json` still lists Prisma/docker-compose permissions and `guard-paths.mjs` still has the (now inert) migration guard — owner to prune by hand.
