# Applyra — Working Context

> Living map for AI agents and humans. Goal: orient in a new session without re-reading code or the whole spec.
> Keep it terse and current. Update in the same commit that changes structure, modules, commands, or decisions.
> Last updated: 2026-11-16 (M0-04)

## 1. Status
- Phase: **M0** — monorepo scaffold (M0-01) + api stack spike (M0-02): Nest 11 bootstrap, Better Auth wiring, `/health/live`; local compose + Zod env config (M0-04).
- Done: AI tooling (see `docs/AI-WORKFLOW.md`); spec review (`docs/SPEC-REVIEW.md`) → split spec v2.1 + ADR 000–021; MVP plan (`docs/plans/mvp.md`, `docs/plans/mvp-tasks.md`); pre-coding consistency pass over spec/ADRs; M0-01 monorepo scaffold (pnpm 11 + Turborepo 2 + TS 6.0 + ESLint 10 boundaries); M0-03 Prisma 7 + PG 18 roles spike (`infra/postgres/init/10-roles.sql`); M0-04 local compose (`compose.yaml` → `infra/compose/compose.yml`) + `.env.example` + `platform/config`; M0-02 spike (NestJS 11 fallback, ESM api; BullMQ 6 + `@nestjs/bullmq` verified on Valkey 9, deps removed until R1 / M3-01).
- Next: M0-05 (CI), then M0-07a → M0-08 → M0-09 → M0-10 (`docs/plans/mvp-tasks.md`).
- Current release target: **R0 "Tracker for myself"** (`docs/spec/02-releases.md`).

## 2. Repo map
Layout ✅ (M0-01; web is a bare TS package until M0-12; api bootstrapped in M0-02):
```
apps/
  web/                 @applyra/web — React 19 + Vite SPA, React Router 8 data mode (feature folders: src/features/<feature>/)
  api/                 @applyra/api — NestJS 11, ESM: src/main.ts (HTTP, `bodyParser: false`) · src/app.module.ts (`AppModule.forRoot(config)`) + src/worker.ts (BullMQ, from R1)
                       `pnpm --filter @applyra/api build` (tsc -p tsconfig.build.json → dist/) · `start` (node dist/main.js, :3000; process env only) · `dev` (scripts/dev.mjs: tsc --watch + node --watch --env-file-if-exists=<root env>)
    src/platform/config/ env.schema.ts (Zod, `parseEnv` → all errors as `KEY: reason`) · load-env.ts (only `process.env` reader; exit 1 + list) · ConfigModule (global) / ConfigService.get(key)
    src/modules/auth/auth.options.ts  `authOptionsFromConfig` (inject ConfigService) → `AppModule.forRoot({ env, auth? })` — `auth` override for tests
    src/modules/<name>/  index.ts (public API) · *.controller.ts · *.service.ts · *.repository.ts (only Prisma access) · *.domain.ts
    prisma/            schema.prisma (source of truth for columns once it exists) · migrations/ (applied = immutable)
packages/
  contracts/           @applyra/contracts — Zod 4 schemas + inferred types (tsup → dist ESM + d.ts; built before other tasks)
  config/              @applyra/config — tsconfig.base.json · eslint.base.js (boundaries rules 1–8, 04 §4.1) · test/boundaries.test.ts + fixtures/
e2e/                   @applyra/e2e — Playwright 1.65.1 (pinned): playwright.config.ts, seed.spec.ts, specs/ (test plans)
infra/postgres/        init/10-roles.sql (DB roles, M0-03; Compose mounts init/ → /docker-entrypoint-initdb.d:ro) · README.md
infra/compose/         compose.yml — local dev infra (M0-04): postgres 18.7, redis = valkey 9.1.3, minio + minio-init (Chainguard, by digest), mailpit; ports 127.0.0.1 only
compose.yaml (root)    `include: [infra/compose/compose.yml]` so `docker compose up -d` works from the root; project name `applyra`
.env.example (root)    every variable, grouped (compose · api · web VITE_*), local-only placeholder values
docs/
  spec/00…12-*.md (spec v2.1) · adr/ (000–021 + README index) · plans/ · CONTEXT.md · AI-WORKFLOW.md · SPEC-REVIEW.md (history)
.claude/
  rules/   path-scoped rules (auto-load by file glob)
  agents/  architect · lead-developer · test-writer · qa-lead · code-/security-/ui-reviewer · playwright-test-*
  skills/  flow commands (feature, plan, implement, review, verify, ship, bugfix, e2e, security-audit, sync-context)
           procedures (new-endpoint, prisma-migration, adr, ai-task) · shadcn (vendored, skills-lock.json)
  hooks/   guard-paths.mjs (blocks .env / applied migrations) · format.mjs (prettier on edited file)
root                   package.json (scripts → turbo) · pnpm-workspace.yaml (allowBuilds) · turbo.json · eslint.config.js (re-exports @applyra/config/eslint) · .prettierrc.json
.mcp.json              playwright-test MCP → node e2e/node_modules/@playwright/test/cli.js (local pinned version)
```

## 3. Modules (`docs/spec/04-architecture.md` §3)
| Module | Release | Status |
|---|---|---|
| auth | R0 | 🚧 M0-02: `modules/auth/` — `auth.config.ts` (`createAuth`), `auth.module.ts`, `signup-allowlist.domain.ts`; memory adapter until M0-08 |
| health (`/health/live`; ready in M0-09) | R0 | 🚧 `modules/health/` |
| users, jobs, applications, reminders, import-export | R0 | — |
| notifications, profile, skills, documents, analytics, ai (extract-job), outbox, audit | R1 | — |
| ingestion (incl. dedup, FX), matching | R2 | — |
| ai (other tasks, embeddings) | R3 | — |
Status legend: — not started · 🚧 in progress · ✅ done (link key files when done). companies/search live in `jobs`; dedup in `ingestion`.

## 4. Key decisions (details in `docs/adr/README.md`)
- Modular monolith + worker entrypoint (001); pnpm + Turborepo (002); Postgres FTS + trigram (003); Zod contracts FE/BE (004).
- R0 side effects synchronous in the same transaction; outbox + BullMQ from R1 (006).
- NestJS **11.x** (12 blocked by nestjs-zod peers, M0-02); api is ESM (`"type": "module"`, `nodenext`, `.js` relative imports).
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
- M0-03 Prisma 7.10.1 on PG 18 (pin 7.10.x; npm `latest` tag is 8.0.0-rc — install `prisma@7` explicitly): preview flag `previewFeatures = ["partialIndexes"]`. Prisma generates, and `migrate diff --from-migrations … --to-schema … --exit-code` reports no drift for: partial `@@unique([...], where: raw("visibility = 'PRIVATE'"), map:)` → `CREATE UNIQUE INDEX … WHERE (visibility = 'PRIVATE')`; `@@index([col(ops: raw("gin_trgm_ops"))], type: Gin)`; `@@index([searchVector], type: Gin)` on `Unsupported("tsvector")`; CHECK constraints (raw, invisible to diff). Later `--create-only` migrations don't touch any of them.
- M0-03 generated column: `searchVector Unsupported("tsvector")? @default(dbgenerated()) @map("search_vector")` — WITHOUT `@default(dbgenerated())` diff reports drift `ALTER COLUMN "search_vector" DROP DEFAULT` (Prisma reads the generation expression as a default). Replace the generated `"search_vector" tsvector` line with the `GENERATED ALWAYS AS (…) STORED` one (05 §7.3).
- M0-03 stays raw SQL: `SET lock_timeout/statement_timeout`, `CREATE EXTENSION pg_trgm/unaccent`, `f_unaccent` — prepend to the migration (Prisma emits the trgm index but not the extension); CHECKs appended at the end. `postgresqlExtensions` preview not used.
- M0-03 schema syntax: one-line enums (`enum Role { USER ADMIN }`, as printed in 05 §4.1) fail validation (P1012) — one value per line. `@default(dbgenerated("uuidv7()")) @db.Uuid` → `DEFAULT uuidv7()` (v7 confirmed via `uuid_extract_version`); `@db.Timestamptz(3)` → `TIMESTAMPTZ(3)`. Better Auth passes its own app-side v7 id, which just overrides the DB default — no conflict; the DB default serves raw SQL/seed inserts.
- M0-03 roles: `infra/postgres/init/10-roles.sql` (M0-04 mounts `infra/postgres/init` → `/docker-entrypoint-initdb.d:ro`; passwords from env `APPLYRA_{APP,MAINTENANCE,BACKUP,METRICS}_PASSWORD` read by psql `\getenv`, ≥ 16 chars, pairwise distinct, fail-fast exit 3; idempotent = rotation; a re-run also revokes hand-granted `pg_read_all_data`/`pg_write_all_data`/`pg_monitor` from app and `pg_write_all_data` from backup/metrics). Log redaction: session `SET log_statement='none'`, `log_min_error_statement='panic'`, `log_min_duration_statement=-1`, `password_encryption='scram-sha-256'` + psql `VERBOSITY terse` (psql's `LINE 1: …` error echo lands in `docker logs`) — verified with server `log_statement=all` + a forced error carrying a password: 0 plaintext hits; verifiers `SCRAM-SHA-256$`. Also `SET track_activities = off` + `pg_stat_statements.track_utility = off` so the password-carrying statement text is not visible in `pg_stat_activity` to `metrics` (pg_monitor) — verified (statement invisible, control visible). Note: a SET only takes effect for the *next* statement, not for a multi-statement string it's part of. `backup` is `NOREPLICATION` until WAL-G (M5-17). `applyra_maintenance` owns DB + `public` (trusted extensions OK; no CREATEDB → `migrate dev`/`diff` need `SHADOW_DATABASE_URL` on a CREATEDB/superuser role); `applyra_app` gets DML via default privileges, DDL/TRUNCATE/TEMP denied (verified). Migrations reference `applyra_app` (AuditLog REVOKE, verified incl. shadow DB) → Testcontainers must run the roles script before `migrate deploy` (M0-07a). No `GRANT … ON ALL TABLES` in the script on purpose (a re-run would re-grant AuditLog UPDATE/DELETE).
- M0-03 `_prisma_migrations`: Prisma creates it on the first deploy as maintenance → default privileges give the app DML. Every `migrate deploy` (local, Testcontainers template, CI, deploy job) is followed by `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_prisma_migrations" FROM applyra_app;` as maintenance (M0-08, M0-14); later deploys still work after the revoke (verified). Migrations must run as `applyra_maintenance` — default privileges are `FOR ROLE applyra_maintenance`; objects created by another role give the app nothing.
- M0-04 config: only `apps/api/src/platform/config/**` may read `process.env` — ESLint `no-restricted-properties` (`process.env`, `process['env']`, destructuring) + `no-restricted-syntax` (`globalThis.process.env`, `require('node:process')`) + `no-restricted-imports` (`env`/default/namespace of `process`/`node:process`); one fixture per case in the boundaries test. `apps/api/test/**` and `*.config.ts` are deliberately not covered. New var = `env.schema.ts` + its spec + `.env.example` (+ `test/support/test-env.ts` if required). Empty value = missing (except `AUTH_SIGNUP_ALLOWLIST`: must be present, may be empty → sign-up closed; config only splits/trims/validates, case-folding is in `isSignupAllowed`). One error per variable, names + reasons only (asserted). `Env` is frozen (`.readonly()` is shallow → allowlist frozen explicitly). `NODE_ENV=production` also rejects any `local-dev-only` value (secret, DB/Redis URLs) and non-https `BETTER_AUTH_URL`/`WEB_ORIGIN` (both must be bare origins). Spec name `AUTH_SIGNUP_ALLOWLIST` (09 §2); `NODE_ENV` required.
- M0-04 → M0-14: production images must not see a local env file — `.dockerignore` with `.env*` + `!.env.example`; `start` never loads an env file (only `dev` does).
- M0-04 optional vars (12 §7, ADR 022: `cp .env.example .env` is enough to start): `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — both or neither (one alone → error on the missing one; cross-field check in `crossFieldIssues`, raw values); `SENTRY_DSN` http(s) URL; `DEMO_ENABLED` strict `true`/`false` (no coerce), unset = false, `true` in `.env.example`. Empty = unset for all. Schema + typed config only: M0-10 registers Google only when both are set, M0-15 wires Sentry, M2-12 the demo endpoint — and must add the 12 §7 production guard "DEMO_ENABLED requires Turnstile" with the Turnstile vars (not in the schema yet).
- M0-04 Better Auth skips its Origin/CSRF check when `NODE_ENV=test` (`skipOriginCheck` default) — integration tests cannot assert trustedOrigins via HTTP; assert the built `AuthConfig` instead; the allowlist hook is driven through `AuthService.instance.$context.internalAdapter.createUser` (runs `databaseHooks.user.create`, rejects with `statusCode 403` + `body.code SIGNUP_CLOSED`) — test/config-bootstrap.test.ts. M0-10 Origin tests must override the skip.
- M0-04 compose: initdb (and `10-roles.sql`) runs only on an EMPTY `applyra_postgres-data` volume — changing role passwords in `.env` later does nothing; re-run the script by hand (infra/postgres/README.md) or recreate the volume (`docker compose down -v` is denied for agents — ask the user). PG 18 image: volume at `/var/lib/postgresql` (PGDATA `/var/lib/postgresql/18/docker`). Healthcheck uses `pg_isready -h 127.0.0.1`: the init-time temp server is socket-only, so healthy ⇒ roles done. Inside the container 127.0.0.1 is `trust` (initdb default) — test passwords via the published port.
- M0-04 MinIO: upstream images are gone (Docker Hub `minio/minio` removed, quay.io needs auth) → `cgr.dev/chainguard/minio` + `cgr.dev/chainguard/minio-client`, both pinned by digest (free tier serves only `:latest`; comment in compose names the date/release — bump = pull `:latest`, take `RepoDigests[0]`). Chainguard minio: entrypoint `/usr/bin/minio` (same `server /data --console-address :9001` args), uid 65532, no curl → healthcheck `mc ready self` (mc ships in the image; alias via `MC_HOST_self`). An older root-owned volume makes it crash (`file access denied`) → the volume is `minio-storage`; stale `applyra_minio-data` from the first try can be removed by the user. `minio-init` creates `applyra-local-{documents,exports}` (private, anonymous GET 403) via `MC_HOST_local` → MinIO credentials must be URL-safe. `docker compose up --wait` exits 1 because the one-shot exits (status is fine) — use plain `up -d` + `ps`.
- M0-04 compose `include` (short form): included file's relative paths resolve against its own dir; the root project's env (root `.env` / `--env-file` / shell) overrides its defaults — verified with `--env-file .env.example` (the default root `.env` feeds the same project environment; confirm once with `cp .env.example .env && docker compose config --quiet`). No `env_file` on the include entry on purpose: an explicit include `env_file` that does not exist fails `config` (verified) — it would break shell-only setups. Host ports overridable (`POSTGRES_HOST_PORT` etc.); author's machine has a native Postgres on 5432 → verified with `POSTGRES_HOST_PORT=15432` (then fix the port in DATABASE_URL too).
- M0-04 web: Vite reads env files from the app dir by default — M0-12 sets `envDir` to the repo root (only `VITE_*` exposed) and adds a typed accessor if needed.
- Hook: a Bash command with a dot-glob such as `.*{…}` (e.g. a grep regex) is blocked as a possible `.env` reference — put such commands in a script file.
- pnpm via corepack on Windows: `corepack enable` fails with EPERM when Node is in Program Files → `corepack enable --install-directory "%APPDATA%\npm" pnpm` (a dir on PATH). Version comes from `packageManager`.
- pnpm 11: `allowBuilds` map in `pnpm-workspace.yaml` (`onlyBuiltDependencies` removed); `strictDepBuilds` defaults to true → install fails on unreviewed build scripts. `minimumReleaseAge: 1440` set explicitly → strict: a <24 h-old version fails resolution (with the implicit default pnpm silently auto-writes `minimumReleaseAgeExclude`). Pin an older version instead (did so for eslint-plugin-boundaries ~7.4.3).
- TS 6.0: `types` defaults to `[]` — base sets it explicitly; add `"types": ["node"]` per package when Node APIs are used. typescript-eslint 8.72 supports TS <6.1 (blocks TS 7).
- ESLint 10 resolves the root `eslint.config.js` from each file, so packages just run `eslint .`. Flat-config `files`/`ignores` are root-relative; boundaries element patterns match right-to-left (that's how the fixture mirror under packages/config/test/fixtures/boundaries/ is classified).
- eslint-plugin-boundaries 7: use `boundaries/dependencies` (policies, `checkAllOrigins` for npm/`node:*`, `checkInternals` for same-module rules); `element-types`/`external`/`entry-point` are legacy. import-x `no-cycle` needs `import-x/parsers` + `import-x/extensions` for .ts or it silently finds nothing; boundaries resolves only via the legacy `import/resolver` key (without it local imports are unresolved and every local rule silently passes). Policies: last match wins; each message ends with `(rule N)` (asserted by the test).
- Rule 4: Prisma generated client must be emitted under `apps/api/src/platform/prisma/generated/` (M0-08) — the lint rule targets that path. Services may import only `platform/prisma/transaction.ts` (real one in M0-08; now a fixture stand-in).
- M0-02 versions: Nest 11.2.10 · nestjs-zod 5.6.0 · better-auth 1.7.25 · @thallesp/nestjs-better-auth 2.8.0 · zod 4.6 · (R1) bullmq 6.7.6 + @nestjs/bullmq 12.0.2 + ioredis 6. `pnpm peers check` clean, no overrides.
- M0-02 Nest 12: nestjs-zod 5.6.0 (2026-11-08) still peers `@nestjs/common` 10–11 (upstream #471 / PR #515 open) → stay on 11; recheck on each nestjs-zod release. thallesp and @nestjs/bullmq already accept 12.
- M0-02 module format: api is ESM (`"type": "module"`, `nodenext`) — Nest 12, Better Auth, the thallesp adapter and contracts are ESM-only; Nest 11 (CJS) imports fine from ESM. Relative imports need `.js`. ESM + `emitDecoratorMetadata`: a circular import between DI classes is a TDZ error, not `undefined` — use `forwardRef` or break the cycle.
- M0-02 tooling: apps/api tsconfig has `experimentalDecorators` + `emitDecoratorMetadata` + `"types": ["node"]`; DI-injected classes and Zod DTOs must be value imports (not `import type`). Vitest needs **no SWC plugin**: Vite 8's Oxc reads both flags from tsconfig and emits `design:paramtypes` (verified by toggling the flag). ESLint: `no-extraneous-class` allows decorated classes in apps/api.
- M0-02 Better Auth: allowlist hook must `throw new APIError('FORBIDDEN', { code: 'SIGNUP_CLOSED' })` — OAuth callback redirects to `errorURL?error=SIGNUP_CLOSED`, programmatic → 403 `{ code, message }`; `return false` → generic `unable_to_create_user`. Hook runs on user create only (existing users sign in — tested). `input: false` fields: dropped on sign-up (200, role stays USER), rejected on `update-user` (400).
- M0-02 thallesp adapter: `forRoot` registers `APP_GUARD` globally + mounts handler as middleware; with `bodyParser: false` it re-adds express json/urlencoded for non-`/api/auth` routes (needs `express` as a direct dep — it `require`s it). Guard 401 body is Nest's default `{ message, statusCode }` until the M0-09 filter maps it to `UNAUTHENTICATED`.
- M0-02 secrets: Better Auth secret = `options.secrets` ?? env `BETTER_AUTH_SECRETS` (array, wins over `options.secret`!), else `options.secret` || env `BETTER_AUTH_SECRET` || `AUTH_SECRET` || public `DEFAULT_SECRET` (`better-auth-secret-12345678901234567890`); outside production the default only warns, in tests validation is skipped (`context/create-context.mjs`). Hence `createAuth` requires `secret` ≥ 32 chars and throws; M0-04: env.schema rejects a set `BETTER_AUTH_SECRETS` (adopting rotation = deliberate change there).
- M0-02 AuthModule seam: `AuthModule.forRootAsync({ imports, inject, useFactory → AuthConfig })`; `createAuth(config)` stays a pure factory. `AuthConfig` requires `secret`, `baseURL`, `trustedOrigins`. Since M0-04 `modules/auth/auth.options.ts` builds it from ConfigService; memory adapter `TODO(M0-08)` lives there.
- M0-02 → M0-09: Better Auth error bodies are `{ code, message }` (guard 401, 403 `SIGNUP_CLOSED`, 400 validation) and Nest's guard 401 is `{ message, statusCode }` — map both to the 06-api error shape. The thallesp adapter enables app-wide CORS from an array `trustedOrigins` with methods GET/POST/PUT/DELETE only (no PATCH) — set `disableTrustedOriginsCors: true` and own CORS in M0-09. Set explicit body-parser size limits (adapter `bodyParser.json.limit`) there too.
- M0-02 → M0-10: before any non-Google provider is enabled (R1 email + password), the allowlist hook must also require `emailVerified === true`. Land with M0-10: cookies `__Host-` + Secure + SameSite=Lax, `session.expiresIn`/`updateAge`/`freshAge`, Better Auth rate limit on the Redis store, and `OriginGuard` (403 `CSRF_ORIGIN`) before the first mutating non-auth route.
- Never copy the test-only `emailAndPassword: { enabled: true }` from `apps/api/test/auth-bootstrap.test.ts` into real config (R0 = Google only).
- M0-02 BullMQ 6: Redis driver is an optional peer — install `ioredis` (or pass a node-redis client). Queue names must not contain `:` (throws); custom `jobId` must not contain `:` or be an integer; job names and scheduler ids may contain `:` (scheduler jobs get id `repeat:<schedulerId>:<ts>`). Convention (applied across docs): one kebab-case queue per owning module + job name, e.g. queue `matching` / job `match-job`, queue `email` / job `send`; scheduler ids `<queue>:<job>[:<key>]` — full list in `04-architecture.md` §5.4. `upsertJobScheduler` twice with the same id → one scheduler; `@Processor`/`WorkerHost` runs scheduled jobs on Valkey 9.
- M0-07a: turbo strict env mode strips undeclared env vars — declare non-secret vars in the task `env`, secrets via `passThroughEnv`; never `globalPassThroughEnv: ["*"]`.
- M0-05: CI must run `pnpm format:check` (Prettier ignores docs/ and .claude/). `lint` has no `^build` dependency (rules are not type-aware).
- Windows dev machine: hooks are Node scripts (no bash/jq). Git Bash heredocs with quotes break — write scripts to files.
- Project agents/skills load only when the Claude Code session starts in the `Applyra` folder.
- `.claude/hooks/guard-paths.mjs` blocks Read/Edit/Write of `.env*` (except `.env.example`) and any Bash command mentioning a `.env` file — false positives possible, rephrase or ask the user; migration files are immutable once tracked by git (untracked `--create-only` migrations may be edited).
- `/review` and `/verify` are model-invocable on purpose (called from `/feature`, `/implement`, `/bugfix`, `/ship`).
- BullMQ custom `jobId` must not contain `:` or be all digits — outbox uses `<eventId>_<consumer>` (04 §5.2).
- `.mcp.json` change takes effect after a Claude Code session restart. Playwright agents were generated with Playwright 1.65.1; after a major upgrade re-run `npx playwright init-agents --loop=claude`, then re-apply the short descriptions and `e2e/` paths.

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
