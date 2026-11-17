# M0-07a · Integration test infra (issue #9)

Branch `feat/M0-07a-integration-test-infra` · Flow /feature · Spec: `11-testing.md` §3 (T-01), §9; `04-architecture.md` §6.1, §7.2; `12-infra-ops.md` §4 (roles) · Depends: M0-04, M0-05 · Unblocks: M0-07b, M0-08, M0-10.

## Goal
One Testcontainers container set per Vitest run (Postgres 18 + Valkey 9), a template DB built the way production builds a DB (roles script → `migrate deploy`), a DB per worker re-cloned per test file, a Redis key prefix per worker, and the test helpers (factories, session, `expectContract`) that later tasks fill in. The CI `integration` job is on.

## Acceptance criteria
1. `pnpm test:integration` (root, via turbo) starts exactly one Postgres (`postgres:18.7`) and one Valkey (`valkey/valkey:9.1.3`) container, both stopped at teardown; nothing is read from `.env*`.
2. Template `applyra_template`: `infra/postgres/init/10-roles.sql` applied with per-run generated passwords; `IS_TEMPLATE true, ALLOW_CONNECTIONS false`; migration hook exists (no-op until M0-08).
3. Every test file gets a fresh `test_w<poolId>` cloned from the template, owned by `applyra_maintenance`, with the same database ACL as the template (asserted); Redis keys under `t<poolId>:` are empty at file start.
4. Smoke (2 files, run in parallel): `current_database()` = own worker DB; a row written by one file is never seen by the other; Redis prefix isolation; `applyra_app` can `SELECT 1`, gets `42501` on `CREATE TABLE` / `CREATE TEMP TABLE` / `TRUNCATE`, but has DML on a table created by `applyra_maintenance` (default privileges survive cloning).
5. Unit tests (no Docker, in `pnpm test`): `expectContract` rejects wrong status and unknown keys at any depth; factories are deterministic for a seed; image tags in tests equal `infra/compose/compose.yml` (drift guard).
6. CI job `integration` green on the PR; `--passWithNoTests` removed; `integration` added to the required-check list.

## Design
**Versions (verified 2026-11-17, npm + node.testcontainers.org).** Testcontainers Node is at **12.2.x** (12.0: Node ≥ 22.22, default wait = image healthcheck else listening ports); spec row says "11.x ◌", so we take 12.x (engines `^24.11.0` OK). Modules: `@testcontainers/postgresql` (`PostgreSqlContainer`: `withDatabase/withUsername/withPassword`, `getHost/getPort`, default wait = `pg_isready` healthcheck + ports, 120 s startup) and `@testcontainers/valkey` (`ValkeyContainer`, `getConnectionUrl()`). Vitest 4: `globalSetup` default export `(project: TestProject) => teardown`, `project.provide(key, value)` (serialisable) + `inject(key)`, typed via `declare module 'vitest' { interface ProvidedContext }`; `poolOptions` removed (top-level `maxWorkers`, `isolate`); `VITEST_POOL_ID` ≤ `maxWorkers` (0- vs 1-based differs between 4 and 5 → code accepts any non-negative int).

**Files (all under `apps/api/`; `test/**` is outside the `process.env` lint ban — still one reader):**
| File | Role |
|---|---|
| `test/support/runner-env.ts` | the only `process.env` reader in `test/`: `VITEST_POOL_ID` (validated int) |
| `test/support/images.ts` | `POSTGRES_IMAGE = 'postgres:18.7'`, `VALKEY_IMAGE = 'valkey/valkey:9.1.3'` |
| `test/support/isolation.ts` | pure: `generateTestPasswords()` (5× `randomBytes(24).base64url`, distinct, ≥ 16), `workerDbName(poolId)` (`/^test_w\d+$/`), `redisPrefix(poolId)` → `t<id>:`; BullMQ prefix `t<id>` (keys `t<id>:<queue>:…`, same SCAN) |
| `test/support/expect-contract.ts` | `expectContract<S extends z.ZodType>(res: { status: number; headers: Record<string,string>; body: unknown }, status: number, schema: S): z.output<S>` |
| `test/factories/factory.ts`, `rng.ts`, `index.ts` | builder skeleton (below); models arrive with their tasks (`user` in M0-08) |
| `test/support/session.ts` | `signInAs(app: INestApplication, who: 'A' \| 'B'): Promise<TestSession>` with `TestSession = { userId: string; agent: TestAgent; cookie: string }`; body `throw new Error('signInAs: implemented in M0-10')` |
| `test/integration/support/global-setup.ts` | containers, template, `provide('infra', …)`, teardown |
| `test/integration/support/postgres.ts` | `prepareTemplate`, `applyMigrations` (hook), `cloneWorkerDb`, `grantDatabaseAccess` (uses `pg`) |
| `test/integration/support/worker-setup.ts` | `setupFiles` entry: `beforeAll` clone DB + flush prefix; exports `testInfra()` → `{ databaseUrl (app), maintenanceUrl, redisUrl, redisPrefix, bullPrefix }` for `testEnv({...})` |
| `test/integration/infra-a.smoke.test.ts`, `infra-b.smoke.test.ts` | AC 4 |

**globalSetup sequence.** (1) generate passwords; (2) start in parallel `PostgreSqlContainer(POSTGRES_IMAGE).withDatabase('postgres').withUsername('postgres').withPassword(su)` and `ValkeyContainer(VALKEY_IMAGE)`; (3) admin `pg.Client` on `postgres`: `DROP DATABASE IF EXISTS applyra_template`, `CREATE DATABASE applyra_template`; (4) `copyFilesToContainer` the roles script to `/tmp/10-roles.sql` (path resolved from `import.meta.url`), `exec(['psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','applyra_template','-f','/tmp/10-roles.sql'], { env: { APPLYRA_*_PASSWORD } })` — passwords via exec env, not argv or container config; non-zero exit → throw with the (terse, password-free) output; (5) `applyMigrations(templateMaintenanceUrl)` — no-op `TODO(M0-08)`; (6) `ALTER DATABASE applyra_template WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`; (7) `provide('infra', { host, pgPort, valkeyUrl, superuserPassword, appPassword, maintenancePassword })`. Teardown stops both containers. Ryuk stays on (default) locally and on CI, so a killed run leaves nothing.

**Per file (`worker-setup.ts`, `isolate: true` → runs per file).** Admin client on `postgres`: `SELECT pg_advisory_lock(7007)` (serialises clones across workers; avoids "source database is being accessed" races), `DROP DATABASE IF EXISTS test_wN WITH (FORCE)`, `CREATE DATABASE test_wN TEMPLATE applyra_template OWNER applyra_maintenance`, then `grantDatabaseAccess`: `REVOKE ALL ON DATABASE … FROM PUBLIC; GRANT CONNECT ON DATABASE … TO applyra_app, backup, metrics` — database ownership/ACL live in `pg_database` and are **not** copied by `TEMPLATE` (schema ownership + default privileges are, they are in-database catalogs). Mirrors `10-roles.sql` lines 89–91; the smoke test compares `datacl` of clone vs template so drift fails. Redis: `SCAN MATCH t<id>:* COUNT 500` + `UNLINK`. Leftover `test_w*` DBs die with the container.

**M0-08 plug-in.** `applyMigrations(url)` becomes: `execFile` of `prisma migrate deploy` with an explicit minimal env (`PATH` + `MAINTENANCE_DATABASE_URL`=template as `applyra_maintenance`; never an env file), then as maintenance `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_prisma_migrations" FROM applyra_app;`. M0-08 adds the permission-denied test and the ACL allowlist guard; turbo `test:integration` then also `dependsOn: db:generate`.

**Reuse: not in M0-07a.** Reuse keys on container config incl. env → needs a stable superuser password in container env on a Docker-published port, and the template is rebuilt every run anyway. Runs are ephemeral with per-run passwords; 11 §3 "reuse locally" row → "opt-in later if cold start > 15 s" (open question 1).

**Config.** `vitest.integration.config.ts`: `globalSetup`, `setupFiles: ['test/integration/support/worker-setup.ts']`, `maxWorkers: 4` (bounds DB count; CI runner = 4 vCPU), `hookTimeout: 60_000` (clone + Nest boot), `testTimeout: 15_000`, `teardownTimeout: 30_000`. Script: drop `--passWithNoTests`.

**`expectContract`.** Asserts `res.status === status`, `content-type` starts with `application/json`, `schema.safeParse(body)` succeeds (failure message = `z.prettifyError`), and `expect(parsed.data).toStrictEqual(body)` — Zod strips unknown keys by default, so any extra key at any depth (nested objects, array items) fails, which `.strict()` on the top level alone would miss. Rule (doc comment): response schemas are wire schemas — no transforms/defaults. Returns typed data.

**Factories.** `createRng(seed)` (mulberry32, no dep); `defineFactory<T>({ build: (ctx: { seq: number; rng: Rng }) => T })` → `{ build(overrides?), buildList(n, overrides?), reset() }`; persistent variant `defineFactory<T, R>({ build, persist: (db, value) => Promise<R> })` adds `create(db, overrides?)` — `db` typed as the transaction client in M0-08. Default seed constant; `worker-setup` calls `resetFactories()` per file. No faker until a factory needs realistic text (11 §3 "seeded faker" then uses `faker.seed`).

**Turbo / CI.** `turbo.json` task `test:integration`: `dependsOn: ['^build']`, `cache: false` (result depends on Docker images, not inputs — 04 §6.1 row updated; spec name `test:int` → actual `test:integration`), `env: []`, `passThroughEnv: ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','DOCKER_CERT_PATH','DOCKER_TLS_VERIFY','TESTCONTAINERS_RYUK_DISABLED','TESTCONTAINERS_HOST_OVERRIDE','TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE','HOME','USERPROFILE']` (explicit names: wildcards are documented only for `env`; no secrets needed — all generated). Root script `test:integration` → `turbo run test:integration`. `ci.yml` job `integration` (name `integration`, `if: github.event_name != 'schedule'`, `timeout-minutes: 15`, checkout + `./.github/actions/setup`, `run: pnpm test:integration`) replacing the Stage 2 TODO. No image cache: a pull of two images is faster than `docker save/load` via actions/cache. Tags match compose (drift test); digest pinning see open question 2.

**Local / Windows.** Needs Docker Desktop (WSL2) running; Testcontainers finds the npipe itself; ports are random (native Postgres on 5432 is irrelevant); `psql` runs inside the container (no host client). If Docker is not found under turbo, check `DOCKER_HOST`/context is in `passThroughEnv`.

## Security notes
- All credentials are generated per run (`crypto.randomBytes`), live only in globalSetup memory → `provide` → workers; never logged, never in argv (`exec` env), no `.env*` reads; the roles script's log redaction applies.
- Containers hold synthetic data only; Valkey has no auth (ephemeral, random port) — acceptable for tests, never a pattern for compose/prod.
- Admin SQL uses only validated identifiers (`workerDbName` regex) + `pg` `escapeIdentifier`; no string-built SQL from test input.

## New dev dependencies (`apps/api`)
`@testcontainers/postgresql` + `@testcontainers/valkey` `^12.2` (spec'd container runner, modules per image) · `pg` + `@types/pg` (admin SQL: create/clone DBs, role assertions — Prisma cannot `CREATE DATABASE … TEMPLATE`) · `ioredis` `^6` (Redis client for prefix flush/smoke; same driver BullMQ uses from M3-01). Expect `ssh2`/`cpu-features` build scripts under `strictDepBuilds` → add to `allowBuilds` as `false` (optional native accel, JS fallback) and note it in `CONTEXT.md` §6.

## Steps (one commit each; `pnpm lint && pnpm typecheck && pnpm test` green after each)
1. **Images + drift guard.** Test first: `test/images.test.ts` reads `infra/compose/compose.yml`, extracts `postgres`/`redis` `image:` lines (regex, no YAML dep), expects equality with `test/support/images.ts` — fails until the file exists. Add deps (+ `allowBuilds`).
2. **Isolation helpers.** Test first `test/support/isolation.test.ts`: passwords distinct, ≥ 16, `[A-Za-z0-9_-]`; `workerDbName` rejects negative/NaN, produces `test_w3`; `redisPrefix(3) === 't3:'`. Then `runner-env.ts` (invalid `VITEST_POOL_ID` → throws with name).
3. **`expectContract`.** Test first `test/support/expect-contract.test.ts`: passes + returns data; fails on wrong status, non-JSON content type, missing field, extra top-level key, extra nested key, extra key in an array item.
4. **Factories + session stub.** Test first `test/factories/factory.test.ts`: same seed ⇒ same `buildList(3)`; overrides win; `seq` increments and `reset()` restarts it; different seeds differ. `session.ts` stub (typecheck only, no test).
5. **Containers + template + per-file clone.** Test first: write both smoke files (AC 3–4; incl. clone `datacl` = template `datacl`, owner `applyra_maintenance`, `42501` cases, maintenance-created table → app INSERT/SELECT OK); run → fail (`inject('infra')` undefined). Then `global-setup.ts`, `postgres.ts`, `worker-setup.ts`, config; remove `--passWithNoTests`; green locally on Docker Desktop.
6. **Turbo + CI + docs.** turbo task + root script; `ci.yml` `integration` job; CONTEXT.md (repo map, §6: test infra gotchas — TEMPLATE does not copy DB ACL/owner, pool id, `allowBuilds`; required checks + `integration`); spec: 04 §6.1 row (`test:integration`, cache off), §7.2 Testcontainers `12.x ✓`, 11 §3 reuse row + MinIO row ("added with M4-14, first storage test"). Verify the PR run shows the job green and the log shows two containers + Ryuk.

## Out of scope / follow-ups
- Prisma schema, `migrate deploy`, `_prisma_migrations` REVOKE + its test, `user` factory, Prisma "no userId" extension → M0-08.
- IDOR gate / route table → M0-07b. Real `signInAs` via auth path + mocked Google token endpoint → M0-10.
- MinIO container + bucket per worker (`test-w<id>`) → M4-14 (first storage integration test), Chainguard digest from compose.
- Lint rule restricting `process.env` in `apps/api/test/**` to `runner-env.ts` (convention for now).
- Container reuse (if approved later), digest pinning (with M0-06b Renovate).

## Open questions
1. OK to drop "reuse containers locally" from 11 §3 for now (ephemeral runs, per-run passwords) and revisit only if cold start > 15 s?
2. Pin `postgres:18.7` / `valkey/valkey:9.1.3` by digest (compose + tests together) now, or leave tags until M0-06b Renovate manages digests?
