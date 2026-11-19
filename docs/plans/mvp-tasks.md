# MVP tasks — R0 + R1-lite

> Applyra · план задач до `docs/plans/mvp.md` · джерела: `docs/spec/02-releases.md` (обсяг, DoD), `03-functional.md` (FR + AC) · 2026-11-16

## Як користуватись

- Одна задача = один PR = один GitHub issue (ID задачі в назві issue/PR, напр. `M1-08 · Transitions + undo`). Issue посилається на FR і на розділ спеки.
- Порядок усередині milestone — за `Depends`; задачі без взаємних залежностей можна брати в будь-якому порядку.
- `Flow`: `/feature` — plan → approve → implement → review → verify → accept; `direct` — без окремого плану (дрібне, без змін схеми): `/implement docs/plans/mvp-tasks.md <ID>`, AC задачі = кроки плану, далі `/review` + `/verify` + `qa-lead` як зазвичай; `spike` — throwaway-перевірка, результат у `docs/CONTEXT.md` §6 / ADR, код лише якщо придатний; `/e2e`, `/security-audit`, `/ship` — відповідні flow-команди.
- DoD: R0-задачі — `02-releases.md` §5.1; з M3 — §5.2. Тести з AC — частина задачі, не окремий PR.
- `later` — розділ `Later — when hosting` (ADR 022): задачі, потрібні лише для hosted-середовища; не плануються, поки не вирішено хостити.
- `later-r1l` — розділ `Later — after R1-lite` (ADR 025): R1-задачі поза R1-lite; не входять у gate M5-28, беруться за цінністю або разом із хостингом.
- `optional` — нижчий пріоритет; береться, якщо milestone іде за графіком. Не виконано → переноситься в `Later`/наступний milestone свідомо (запис у PR-описі релізу).
- Оцінки — години роботи соло-розробника з Claude Code (включно з review/verify), не «чистий» час агента.

**Area:** `repo` · `infra` · `ci` · `contracts` · `api` · `worker` · `db` · `web` · `e2e` · `security` · `obs` · `docs`.

### Підсумок годин

| Milestone | 02 (ціль) | План: core | optional | Разом |
|---|---|---|---|---|
| M0 Setup | 12–15 | 29 | 1.5 | 30.5 |
| M1 Tracker | 22–26 | 41.5 | 1.5 | 43 |
| M2 Migration | 11–14 | 26.5 | — | 26.5 |
| **R0** | **45–55** | **97** | **3** | **100** |
| M3 Capture | ≈21.5 | 21.5 | — | 21.5 |
| M4 Profile, Matching & AI | ≈34 | 34 | — | 34 |
| M5 Launch | ≈11.5 | 11.5 | 1 | 12.5 |
| **R1-lite** (ADR 025) | **≈68** | **67** | **1** | **68** |
| Later — after R1-lite | — | 122 | 4 | 126 |
| Later — when hosting | — | 6 | 6 | 12 |

**ADR 022 (2026-11-16):** R0 core 90.5 → 97 (−2 год: M0-13 у Later, M0-15 звужено; +8.5 год: M0-17 Terraform validate, M2-12 demo sign-in, M2-13 README, M2-14 devcontainer, seed +0.5); R1 core 193.5 → 186, optional 10 → 4 (M5-17/18/20 у Later, M5-19 закрито, M5-12/21/27 звужено). R0+R1 разом 297 → 290; ще 12 год лежать у Later і не потрібні без хостингу.

**ADR 025 (2026-11-19):** R0 без змін. R1 (186 core + 4 optional = 190) → R1-lite (67 + 1 = 68).
- У R1-lite лишились: M3-01, M3-03, M3-20…M3-25; M4-01…M4-06, M4-08, M4-19…M4-23; M5-21, M5-22, M5-25…M5-28; M5-14 (optional).
- Звужено: M3-23, M4-03, M4-05, M4-21, M5-14, M5-21, M5-25, M5-26 (−8 год).
- Нові задачі: M4-24, M4-25 (matching-lite, +6 год).
- Решта переїхала в `Later — after R1-lite`: 116 core + 4 optional, плюс залишки звужених задач M4-03b/M4-05b/M4-21b/M5-21b/M5-26b (6 год).
- Залежності перевірено: жодна задача R1-lite не залежить від Later.
- R0-задачі, що готують лише відкладене: M0-16 (optional spike presigned PUT, тільки для documents) — пропустити.

**Висновок:** core-обсяг R0 ≈ 1.8–2.2× від оцінки 02, R1 ≈ 1.2–1.5×. Колонка «02 (ціль)» лишається як орієнтир; при відставанні першими знімаються `optional` (правило `mvp.md` §7), але це закриває лише ~3 год R0 / ~4 год R1 — решта розриву вирішується календарем або правкою спеки (варіанти — `mvp.md` §2). Нічого з FR не вирізано.

---

## M0 Setup (тиждень 1)

**E01 Foundation**

### M0-01 · Monorepo scaffold
- FR: — · Area: repo · Est: 2h · Depends: — · Flow: direct
- AC:
  - pnpm 11 (глобально `npm i -g pnpm`, версія з `packageManager`; corepack не використовуємо — ADR 024) workspaces + Turborepo 2; workspaces `apps/web`, `apps/api`, `packages/contracts`, `e2e` (окремий пакет, `04-architecture.md` §6; існуючий `e2e/seed.spec.ts` зберегти); `pnpm dev|lint|typecheck|test|build` працюють з кореня.
  - `e2e/package.json` з pinned `@playwright/test` 1.65.x (MCP playwright-test використовує локальну версію). `packages/config` — лише якщо ≥ 2 споживачі.
  - `apps/api` тут — голий TS-пакет зі скелетом `src/modules/` + `src/platform/` (спільний backend-код живе лише в `src/platform/`); пакети Nest ставить M0-02.
  - tsconfig base: strict + `noUncheckedIndexedAccess`; ESLint flat + `eslint-plugin-boundaries` (правила 1–6 `04-architecture.md` §4.1) + `import-x/no-cycle`; Prettier.
  - `pnpm-workspace.yaml` з налаштуванням дозволених build-скриптів; `engines` (Node 26, ADR 024); README skeleton, PR template, `.gitattributes`.
  - Перевірка boundaries: Vitest-тест запускає ESLint Node API на фікстурі з порушенням (тека в ESLint `ignores`, тож звичайний `pnpm lint` зелений) і очікує помилку правила. `passWithNoTests`, щоб `pnpm test` був зелений з порожніми пакетами.
  - Перевірити під час реалізації (не з пам'яті): назву налаштування pnpm 11 (`onlyBuiltDependencies` vs `allowBuilds`), підтримку pinned-версії TypeScript у typescript-eslint.
- Notes: оновити `CONTEXT.md` §2 (✅ layout) і Commands у `CLAUDE.md`.

### M0-02 · Spike: NestJS 12 / nestjs-zod / Better Auth / BullMQ 6
- FR: — · Area: api · Est: 2h · Depends: M0-01 · Flow: spike
- AC:
  - Мінімальний Nest app на 12.x з `nestjs-zod` 5 і `@thallesp/nestjs-better-auth`: peer deps без `--force`, `bodyParser: false`, глобальний guard + `@AllowAnonymous`; інакше — фіксуємо 11.x.
  - Better Auth: `generateId` → UUID v7, `user.additionalFields` (`role`, `demoExpiresAt`), `databaseHooks.user.create.before` (allowlist), мапінг помилки в `SIGNUP_CLOSED`.
  - BullMQ 6 + `@nestjs/bullmq`: `upsertJobScheduler` і processor працюють; інакше — рішення «власна тонка обгортка».
  - Результат: рядки в `CONTEXT.md` §6, примітки в ADR 004/007 (і 001, якщо обгортка).

### M0-03 · Spike: Prisma 7 raw features + DB roles
- FR: — · Area: db · Est: 1.5h · Depends: M0-01 · Flow: spike
- AC:
  - Перевірено на PG 18 (throwaway `docker run postgres:18`; compose з'являється лише в M0-04): partial `@@unique(where:)` (preview), `ops: raw("gin_trgm_ops")`, GIN на `Unsupported("tsvector")`, `migrate diff --exit-code` без хибного drift для CHECK.
  - Init-скрипт ролей `applyra_app` / `applyra_maintenance` / `backup` / `metrics` з grants `12-infra-ops.md` §4; `applyra_app` не може DDL (перевірено).
  - Що не працює в Prisma → raw SQL у міграції; записано в `CONTEXT.md` §6 і ADR 016.

### M0-04 · Docker Compose + env config
- FR: — · Area: infra · Est: 1h · Depends: M0-01, M0-03 · Flow: direct
- AC:
  - `docker compose up -d`: postgres 18 (init ролей з M0-03), сервіс `redis` (image `valkey/valkey:9`), minio (`cgr.dev/chainguard/minio`, pinned digest — upstream community images припинені), mailpit; healthchecks.
  - `apps/api/src/platform/config/env.schema.ts` (Zod): невалідна/відсутня змінна → процес падає з переліком; `.env.example` з коментарями; web — тільки `VITE_*`.
  - (ADR 022) `cp .env.example .env` достатньо для старту: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` і `SENTRY_DSN` опційні (Google provider — лише коли задані обидва; один без іншого → помилка схеми); `DEMO_ENABLED` (boolean, `true` у `.env.example`) — сам endpoint з'являється в M2-12.

### M0-05 · CI pipeline
- FR: — · Area: ci · Est: 2h · Depends: M0-01 · Flow: direct
- AC:
  - `ci.yml` (PR + `main`), `--frozen-lockfile`; стадії вмикаються, щойно з'являється їхній предмет (кожна — окремий job, required check з моменту ввімкнення):
    1. зараз: lint/prettier/typecheck → unit + coverage `**/*.domain.ts` ≥ 90% → gitleaks + `pnpm audit --audit-level=high`;
    2. integration (Testcontainers, включно з IDOR gate) — вмикає M0-07a;
    3. migrations (drift, squawk, clean apply, якщо змінено `prisma/`) — вмикає M0-08 (перша міграція);
    4. deploy-ready: build images multi-arch + `compose config` + actionlint — вмикає M0-14; `terraform.yml` — M0-17.
  - `permissions: contents: read` top-level. Branch protection на `main` з обов'язковими checks — **відкладено** (рішення автора 2026-11-17: репозиторій лишається приватним, а на безкоштовному плані GitHub захист гілок для приватних репо недоступний); вмикається, коли репо стане публічним або з'явиться платний план — перелік required checks фіксується в `docs/CONTEXT.md`.
- Notes: `11-testing.md` §9 (колонка R0), `09-security-privacy.md` §14.

### M0-06 · Supply chain gates
- FR: — · Area: ci, security · Est: 1h · Depends: M0-05 · Flow: direct
- AC:
  - Semgrep CE (SAST) і osv-scanner у CI (PR + weekly) як required checks (коли branch protection увімкнено) — R0 gate разом із `pnpm audit` і gitleaks; CodeQL — коли репо стане публічним (ADR 023) (`11-testing.md` §9).

### M0-06b · Renovate + Actions SHA pinning ✅
- FR: — · Area: ci, security · Est: 0.5h · Depends: M0-06 · Flow: direct · **optional**
- AC:
  - Renovate (`minimumReleaseAge: 3 days`, grouped); усі Actions pinned на SHA.

### M0-07a · Integration test infra
- FR: — · Area: api, ci · Est: 1.5h · Depends: M0-04 · Flow: /feature
- AC:
  - Vitest `globalSetup`: один набір контейнерів, template DB (= `migrate deploy`; до M0-08 порожня), БД на worker, Redis prefix (`11-testing.md` §3).
  - Каркас factories (`test/factories/*`; моделі додають задачі, що їх створюють — `user` у M0-08), helper сесії для user A/B (наповнюється в M0-10), `expectContract(res, Schema)` (strict).
  - Integration-стадія `ci.yml` увімкнена (M0-05 п. 2); smoke-тест інфраструктури зелений.
- Notes: передує M0-08 і M0-10.

### M0-07b · IDOR gate skeleton
- FR: FR-AUTH-03 · Area: api, ci, security · Est: 1h · Depends: M0-07a, M0-10 · Flow: /feature
- AC:
  - Route table через `DiscoveryService`; gate: не-`@Public` route без fixture/`@IdorExempt('reason')` → fail зі списком; не-`@Public` route без guard → fail.
  - Навмисний route без fixture у тестовому модулі → gate падає (тест самого gate).

**E10 Platform**

### M0-08 · Prisma baseline + platform/prisma
- FR: — · Area: db, api · Est: 1.5h · Depends: M0-03, M0-04, M0-07a · Flow: /feature
- AC:
  - `prisma.config.ts`, adapter-pg, generator `output`; міграція extensions (`pg_trgm`, `unaccent`, `f_unaccent`) + `User`, `Session`, `Account`, `Verification`, `UserSettings` (`05-data-model.md` §4.2) — лише моделі/поля без маркера `// R1+` у §4.
  - Перша міграція вмикає migrations-стадію `ci.yml` (M0-05 п. 3); `user` factory для M0-07a.
  - Prisma Extension: запит до user-scoped моделі без `userId` у `where` → warning у dev, fail у тестах.
  - Migrate one-off через `MAINTENANCE_DATABASE_URL`; runtime — `DATABASE_URL` (`applyra_app`).
  - (M0-03) Enums у `schema.prisma` — по значенню на рядок (однорядковий запис з 05 §4.1 не валідний). Partial unique / trigram / GIN оголошуються лише в схемі (Prisma генерує їх сам); raw SQL на початку міграції — `SET lock_timeout`/`statement_timeout`, extensions і `f_unaccent` **перед** CREATE TABLE/INDEX; у кінці — CHECK з 05 §7.4. Testcontainers template DB: спершу `infra/postgres/init/10-roles.sql`, потім `migrate deploy` (міграції посилаються на `applyra_app`). `migrate dev` під `applyra_maintenance` потребує `SHADOW_DATABASE_URL` (роль без CREATEDB). Після кожного `migrate deploy` (local, Testcontainers template, CI, deploy) під maintenance: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_prisma_migrations" FROM applyra_app;` (таблицю створює сам Prisma під час deploy, тому не init-скрипт і не міграція; повторний deploy після revoke працює — M0-03) + інтеграційний тест: `applyra_app` отримує permission denied на UPDATE/DELETE `_prisma_migrations`. Generator: `output = "../src/platform/prisma/generated"`, `moduleFormat = "esm"` (05 §2.2).
  - ACL guard (інтеграційний тест): таблиці, на яких `applyra_app` має UPDATE/DELETE, збігаються з allowlist (`AuditLog` і `_prisma_migrations` виключені).

### M0-09 · HTTP platform hardening
- FR: FR-AUTH-03 · Area: api, contracts, security · Est: 2.5h · Depends: M0-02, M0-04, M0-08 · Flow: /feature
- AC:
  - `packages/contracts`: enum `ErrorCode` і схема error shape за `06-api.md` §3.1 (створюються тут; M1-02 лише розширює доменними кодами, якщо чогось бракує).
  - Error filter (`apps/api/src/platform/`): формат + `ErrorCode` з contracts, `requestId` = `X-Request-Id`, без stack trace; Zod → 400 `VALIDATION_ERROR`.
  - pino + redaction-список `09-security-privacy.md` §10 (unit: запис з усіма полями → жодного значення).
  - helmet headers API (§9.2), `Cache-Control: no-store`; CORS allowlist; `OriginGuard` → 403 `CSRF_ORIGIN`; non-JSON мутація → 415; JSON body > 1 MB → 413.
  - `/health/live`, `/health/ready` (PG, Redis); Supertest на headers/CORS/Origin/415.

**E02 Auth**

### M0-10 · Google OAuth + allowlist + sessions
- FR: FR-AUTH-01, FR-AUTH-02, FR-AUTH-03, FR-AUTH-04 · Area: api, security · Est: 3h · Depends: M0-08, M0-09 · Flow: /feature
- AC:
  - Google OAuth (PKCE) через Better Auth; sign-out інвалідує сесію на сервері.
  - Email поза `AUTH_SIGNUP_ALLOWLIST` → акаунт не створено; існуючий користувач входить без перевірки. Hook кидає `APIError('FORBIDDEN', { code: 'SIGNUP_CLOSED' })` (M0-02): програмний виклик → `403 { code: SIGNUP_CLOSED }`, OAuth callback → redirect на `errorCallbackURL` (`${WEB_ORIGIN}/sign-in`) з `?error=SIGNUP_CLOSED` (не 403 — M0-12 показує «Access is invite-only» за цим параметром); integration перевіряє `302` + `Location`.
  - Idle 7 д / absolute 30 д (перевірка в guard), rotation при вході; cookie `__Host-applyra.session; HttpOnly; Secure; SameSite=Lax`.
  - Integration з mocked Google token endpoint; запит без сесії → 401; helper сесії user A/B (M0-07a) працює через реальний auth-шлях.
  - (ADR 022) Без `GOOGLE_CLIENT_ID/SECRET` Google provider не реєструється, API стартує (integration).
- Notes: результат M0-02; ADR 007/008. `POST /api/auth/revoke-sessions` — R1 (M3-09).

### M0-11 · `/me` + `PATCH /me/settings`
- FR: FR-PROF-01 · Area: api, contracts · Est: 1h · Depends: M0-10 · Flow: /feature
- AC:
  - `GET /me` → user + settings; `PATCH /me/settings` (timezone, stale-пороги, `hotkeysEnabled`), `.strict()`.
  - Невалідна IANA-зона → 400 `VALIDATION_ERROR`; `UserSettings` створюється при першому вході; `@IdorExempt` з причиною.

### M0-12 · Web foundation + sign-in + Settings — split (2026-11-18, plan `docs/plans/2026-11-18-m0-12-web-foundation.md`)
- **M0-12a** (FR-AUTH-01, FR-AUTH-02 · Est 4.5h · Depends: M0-11): toolchain, tokens + contrast test, typed client, router + shell + auth gate + 404/loading/error, `/sign-in`, sign-out, web ESLint rules, `pnpm dev` = contracts + api + web. `/applications`, `/today` — статичні placeholders «Arrives with M1» (рішення Q1 користувача — свідомий виняток з «no UI without backend»); після входу завжди `/applications` (Q2, гілку Today додає M1).
- **M0-12b** ✅ (FR-PROF-01 · Est 2.5h · Depends: M0-12a): timezone при першому вході, `/settings/preferences` (timezone, пороги, hotkeys, theme selector — Q4), `/settings/account`, `lib/format` (Intl).
- FR: FR-AUTH-01, FR-AUTH-02, FR-PROF-01 · Area: web · Est: 7h (a 4.5h + b 2.5h) · Depends: M0-11 · Flow: /feature
- AC:
  - Vite 8 + React Router 8 data mode + TanStack Query + Tailwind 4/shadcn, токени `10-frontend-ux.md` §8 (contrast check у тестах); typed API client з contracts.
  - `/sign-in` (Google — лише якщо налаштовано, прапорець `VITE_*`; `signIn.social` з абсолютними `callbackURL`/`errorCallbackURL` на `WEB_ORIGIN` (`errorCallbackURL: `${WEB_ORIGIN}/sign-in`` — відносний шлях резолвиться на origin API, M0-10); «Try demo» додає M2-12): `?error=SIGNUP_CLOSED` → «Access is invite-only»; `?error=account_not_linked` (Better Auth: непідтверджений Google email для існуючої адреси, M0-10 / 09 §4.4) → повідомлення «підтвердіть email у Google»; інший `?error=` → загальне повідомлення без сирого коду (`10-frontend-ux.md` §2.1); component-тест на всі три випадки. Захищені маршрути, shell з навігацією `Applications · Today · Settings`, `*` → 404, loading/error стани.
  - Перший вхід: timezone з `Intl` зберігається без питань; `/settings/preferences` редагує timezone/пороги/hotkeys; форматування через `Intl`.
  - `index.html` без inline-скриптів (CSP).

**E10 Ops**

> M0-13 (provisioning), deploy-частина колишнього M0-14 (тепер M0-14b) і off-site частина M0-15 (M0-15b) — у `Later — when hosting` (ADR 022).

### M0-14 · Production images + compose.prod (deploy-ready) ✅
- M0-14b carries over (added at M0-14 review): **api image < 500 MB** uncompressed (now ~900 MB: pnpm `--prod` installs prisma/better-auth optional peers resolved in the lockfile — likely fix `packageExtensions`/`peerDependenciesMeta` marking them optional-unresolved, or `pnpm deploy` once frozen-safe); **caddy image clean** (Trivy/Scout: no fixable HIGH/CRITICAL) or a fixed tag **before `HOSTING_ENABLED=true`**; GHCR login on the host before the first pull.
- FR: — · Area: ci, infra, security · Est: ~6h (було 3h) · Depends: M0-05, M0-12 · Flow: /feature
- AC:
  - Dockerfiles: `apps/api` — один multi-stage image, non-root, без `pnpm`/`npm` у runtime, base pinned digest (намічено `node:26-trixie-slim@sha256`, ADR 024; distroless Node 26 — оцінити тут), build stage `npm i -g pnpm@<packageManager>`, entrypoints `main` / `worker` / `migrate`; `caddy` — reverse proxy + статика `apps/web/dist` з headers ідентичними `_headers` (`09-security-privacy.md` §9.1; snapshot-тест на збіг значень).
  - `ci.yml` п. 4: buildx `linux/amd64,linux/arm64` (на PR без push; GHCR push — M0-14b), `docker compose -f infra/compose/compose.yml -f infra/compose/compose.prod.yml config -q`, actionlint на `.github/workflows/*`.
  - `compose.prod.yml`: caddy, api, `migrate` (one-off: `migrate deploy` + `REVOKE … ON "_prisma_migrations" FROM applyra_app;` під `applyra_maintenance`, M0-08), postgres, `redis` (`valkey/valkey:9`); мережі `edge`/`internal`/`outbound`; без backup-cron (M0-15b).
  - `deploy-prod.yml` — тільки `workflow_dispatch`, Environment `production`, кроки `12-infra-ops.md` §8.2 (GHCR digest → `.env` з secrets → migrate → restart api → `wrangler pages deploy` з `_headers` → health-check); у R0 не запускається. `apps/web/public/_headers` з §9.1.
  - Локальна перевірка: `docker compose -f … -f compose.prod.yml up` → `https://app.applyra.localhost` / `https://api.applyra.localhost` (Caddy internal CA; `*.localhost` під спільним `applyra.localhost`, щоб `__Host-` cookies були same-site) → demo sign-in (після M2-12) / `/health/ready` 200; кроки в `infra/README.md`.
- Notes: результат spike CSP на Pages custom domain — M0-14b; до того Caddy static — робочий шлях.

### M0-15 · Local backup script + Sentry api (optional DSN) ✅
- FR: — · Area: infra, obs · Est: 1h · Depends: M0-04, M0-09 · Flow: direct
- AC:
  - `pnpm db:backup`: `pg_dump -Fc` (роль `backup`, через `docker compose exec`) у `./backups/` (gitignored), ротація — останні 14 файлів; `pnpm db:restore <file>` — в ізольований контейнер `postgres:18` (`12-infra-ops.md` §5).
  - Sentry api ініціалізується лише при `SENTRY_DSN` (`sendDefaultPii: false`, `beforeSend` scrub — unit на scrub); без DSN — no-op.

### M0-16 · Spike: presigned PUT (MinIO; R2 — when hosting)
- FR: FR-DOC-01 · Area: api · Est: 1h · Depends: M0-04 · Flow: spike · **optional**
- AC:
  - Presigned PUT з підписаними `Content-Length` і `Content-Type`: інший розмір/тип → MinIO відхиляє. Перевірка на R2 — частина M0-13 (when hosting). Результат у `CONTEXT.md` §6 / ADR 010.
- Notes: потрібен до M4-14; якщо не встигли в M0 — перший крок M4-14.

### M0-17 · Terraform code + CI validate
- FR: — · Area: infra, ci · Est: 2h · Depends: M0-05 · Flow: direct
- AC:
  - `infra/terraform/{modules,envs/production}`: `hcloud` (server — x86 або ARM `cax`-клас змінною, firewall: 80/443 тільки Cloudflare ranges, 22 закритий; volume; cloud-init: Docker, Tailscale, host firewall), `cloudflare` (DNS `app.`/`api.`, Pages project + custom domain, R2 buckets + lifecycle); S3-backend на R2 оголошено, але не ініціалізується в CI. Providers і версії pinned (`.terraform.lock.hcl`).
  - `terraform.yml` (PR зі змінами `infra/terraform/**`): `fmt -check -recursive`, `init -backend=false` + `validate`; без credentials і без `plan` (plan/apply — M0-13).
  - `infra/README.md` → розділ «Deploy-ready / if hosting later» з варіантами `12-infra-ops.md` §2.1.

---

## M1 Tracker (тижні 2–3)

**E03 / E04 — дані та платформа**

### M1-01 · R0 domain schema migration
- FR: FR-APP-02, FR-JOB-04 · Area: db · Est: 2h · Depends: M0-08 · Flow: /feature (`/prisma-migration`)
- AC:
  - `Job`, `Application`, `ApplicationEvent`, `Reminder`, `ImportSession`, `IdempotencyRecord` за `05-data-model.md` §4.2 — лише моделі/поля без маркера `// R1+` у §4 (зокрема без `UserJob`, G-08); FK/cascade за §5.
  - Partial unique: активна заявка на (user, job) (`archivedAt IS NULL`), PRIVATE `canonicalUrl` на owner; один відкритий `NEXT_ACTION` reminder на заявку; CHECK з §7.4.
  - Integration: порушення кожного unique/CHECK дає очікувану помилку; drift = 0.

### M1-02 · Contracts R0 domain
- FR: FR-APP-01, FR-JOB-01, FR-REM-01 · Area: contracts · Est: 1.5h · Depends: M0-09 · Flow: direct
- AC:
  - Zod 4: enums (status, origin, channel, priority, event types, reminder kind/source), input `.strict()` без `userId/ownerId/role`, response-схеми, cursor-pagination; `ErrorCode` з M0-09 лише розширюється доменними кодами, якщо бракує.
  - Ліміти полів (`title` ≤ 300, `notes`/`descriptionText` ≤ 50 000); unit-тести схем.

### M1-03 · Idempotency-Key interceptor
- FR: FR-APP-04 · Area: api · Est: 2h · Depends: M1-01 · Flow: /feature
- AC:
  - `@Idempotent()` (IK required → `400 IDEMPOTENCY_KEY_REQUIRED`); scope (userId, key), `requestHash`, TTL 24 год, запис у транзакції мутації.
  - Replay → той самий status/body + `Idempotent-Replayed: true`; інший хеш → `422 IDEMPOTENCY_KEY_REUSED`; паралельний → чекає/`409 IDEMPOTENCY_IN_PROGRESS`; 5xx не зберігаються.
  - Integration-тести на всі гілки.
- Notes: `06-api.md` §4.

**E04 Jobs & Capture**

### M1-04 · Jobs: canonicalUrl + CRUD + dedup
- FR: FR-JOB-01, FR-JOB-02, FR-JOB-03, FR-JOB-04, FR-JOB-05, FR-JOB-06, FR-PRIV-04 · Area: api, contracts · Est: 2.5h · Depends: M1-01, M1-02, M0-07b · Flow: /feature
- AC:
  - `canonicalUrl` — pure function у `jobs.domain.ts` (unit: host case, `www.`, fragment, `utm_*`, `fbclid`, `gclid`, `ref`, trailing slash).
  - `POST /jobs` (PRIVATE, MANUAL, paste text як plain text) створює лише PRIVATE `Job`, без `UserJob` (R1, G-08) → дубль `canonicalUrl` → `409 CONFLICT_DUPLICATE_JOB` з `existingJobId`.
  - `GET/PATCH/DELETE /jobs/:id` тільки owner; DELETE знімає `jobId` у заявок, snapshot лишається; повторне → 404.
  - IDOR fixtures для всіх маршрутів (чужа приватна → 404).

**E03 Applications**

### M1-05 · Applications domain rules
- FR: FR-APP-03, FR-APP-13 · Area: api · Est: 1.5h · Depends: M1-02 · Flow: /feature (test-first)
- AC:
  - `applications.domain.ts`: валідація переходу (той самий статус / archived → `INVALID_TRANSITION`), `occurredAt` > now + 5 хв → помилка, перший `APPLIED` ставить `appliedAt`.
  - `daysSinceActivity` у TZ користувача (`floor`), тільки події з `actor = USER`/`IMPORT`; unit-тести з fake clock, coverage ≥ 90%.

### M1-06 · Applications: create / read / update / delete
- FR: FR-APP-01, FR-APP-02, FR-APP-12, FR-PRIV-04 · Area: api · Est: 2.5h · Depends: M1-03, M1-04, M1-05 · Flow: /feature
- AC:
  - `POST /applications` (IK): з `jobId`, inline `job` (одна транзакція) або без job (`companyName` + `roleTitle` обов'язкові); подія `CREATED`.
  - Активна заявка на job → `409 CONFLICT_ACTIVE_APPLICATION` + `existingApplicationId`.
  - `GET/PATCH /applications/:id` (PATCH без `status`/`nextAction*`); `DELETE` — hard delete з подіями й reminders.
  - IDOR (включно з create з чужим `jobId` → 404); contract-тести відповідей.

### M1-07 · Archive / unarchive / bulk archive
- FR: FR-APP-11, FR-APP-07, FR-APP-02 · Area: api · Est: 1.5h · Depends: M1-06 · Flow: /feature
- AC:
  - `archive`/`unarchive` не змінюють статус; unarchive при активній іншій → `409 CONFLICT_ACTIVE_APPLICATION`.
  - `POST /applications/bulk/archive` (IK, ≤ 100 id) → `{ archived, notFound[] }`, чужі id — у `notFound`, N подій однією операцією.
  - Flow «archive old & create new» покрито integration-тестом.

### M1-08 · Transitions + undo
- FR: FR-APP-03, FR-APP-04, FR-APP-05 · Area: api · Est: 2.5h · Depends: M1-03, M1-05, M1-06 · Flow: /feature
- AC:
  - `POST /applications/:id/transitions` (IK): рівно одна `STATUS_CHANGED` з from/to/`occurredAt`; оновлення `lastActivityAt`; майбутній `occurredAt` → 400.
  - Replay з тим самим ключем не створює дубль події.
  - `DELETE /applications/:id/events/:eventId` для останнього `STATUS_CHANGED` ≤ 15 с → статус = `fromStatus`; не остання / > 15 с / `CREATED` → `409 CONFLICT_STATE` (fake clock).
  - IDOR для обох маршрутів.

### M1-09 · Timeline events
- FR: FR-APP-09, FR-APP-10 · Area: api · Est: 1.5h · Depends: M1-06 · Flow: /feature
- AC:
  - `GET /applications/:id/events`: `occurredAt` desc, tie → `createdAt`, cursor; backdated події на своєму місці.
  - `POST /applications/:id/events` (`NOTE`, `MESSAGE_LOGGED`, `FOLLOW_UP_SENT`) з `occurredAt`; `lastActivityAt` оновлюється лише якщо новіша.
  - IDOR + validation (тип поза allowlist → 400).

### M1-10 · Applications list + Kanban view
- FR: FR-APP-07, FR-APP-13, FR-APP-06 · Area: api · Est: 2h · Depends: M1-06 · Flow: /feature
- AC:
  - `GET /applications`: `status[]`, `q` (company/role), `archived`, `channel`, `origin`, `sort`, keyset cursor без дублів/пропусків; `limit` ≤ 100.
  - `view=kanban` групує по статусах (≤ 500), кожен item має `daysSinceActivity`, next action.
  - Список не містить заявок user A для user B (IDOR list).

**E05 Reminders**

### M1-11 · Next action → Reminder + actions
- FR: FR-REM-01, FR-REM-03 · Area: api · Est: 2.5h · Depends: M1-06 · Flow: /feature
- AC:
  - `RemindersService.upsertForApplication(tx, …)`: upsert `NEXT_ACTION` + кеш `nextAction*` в одній транзакції; очищення скасовує reminder.
  - `POST /reminders` (IK, `asNextAction`), `PATCH /reminders/:id` (DONE/CANCELLED очищає кеш; Done + «I followed up» → `FOLLOW_UP_SENT`), `POST /reminders/:id/snooze` (1d/3d/until, `snoozeCount++`).
  - Integration: кеш завжди = відкритий reminder після кожної дії; IDOR для всіх маршрутів.

### M1-12 · Today / Overdue / Upcoming
- FR: FR-REM-02 · Area: api · Est: 1.5h · Depends: M1-11 · Flow: /feature (test-first)
- AC:
  - Межі дня — pure function у TZ `UserSettings`; unit: біля опівночі, перехід DST (Europe/Kyiv березень/жовтень).
  - `GET /reminders?range=today|overdue|upcoming` (upcoming = 7 днів); IDOR list.

**Web**

### M1-13 · Add job / application dialog
- FR: FR-JOB-01, FR-JOB-02, FR-JOB-04, FR-APP-01, FR-APP-02 · Area: web · Est: 2.5h · Depends: M1-04, M1-06, M0-12 · Flow: /feature
- AC:
  - Dialog з вкладками Manual / Paste text (текст → description), RHF + Zod resolver з contracts; «Save» і «Save & create application».
  - `409 CONFLICT_DUPLICATE_JOB` → «You already saved this» з посиланням; `409 CONFLICT_ACTIVE_APPLICATION` → «Archive the old application and create a new one».
  - Створення заявки без вакансії; хоткеї `N` / `C`; тести (Testing Library + MSW) на обидва 409.

### M1-14 · Kanban board
- FR: FR-APP-06, FR-APP-05, FR-APP-13 · Area: web · Est: 4h · Depends: M1-08, M1-10, M1-13 · Flow: /feature
- AC:
  - Колонки = статуси, термінальні згорнуті; картка: company, role, salary, `DaysIdleBadge` (колір + текст + іконка), next action.
  - dnd-kit з keyboard sensor + меню «Move to…» (хоткей `M`); optimistic update, помилка → rollback + toast (hook-тест).
  - `UndoToast` 10 с після переходу → `DELETE` останньої події; новий `Idempotency-Key` на кожну дію.

### M1-15 · Applications table
- FR: FR-APP-07, FR-APP-11 · Area: web · Est: 3h · Depends: M1-07, M1-10 · Flow: /feature
- AC:
  - TanStack Table: sorting, фільтри (status, origin, channel, archived) і пошук синхронізовані з URL; column visibility.
  - Inline status select (з undo), bulk archive з `BulkActionBar` (+ undo = unarchive).
  - Back-button відновлює фільтри (тест).

### M1-16 · Application detail drawer
- FR: FR-APP-08, FR-APP-09, FR-APP-10 · Area: web · Est: 3h · Depends: M1-09, M1-14 · Flow: /feature
- AC:
  - `/applications/:id` — drawer (nested route), mobile — повна сторінка; вкладки Overview / Timeline / Notes, без contacts/interviews/CV.
  - Редагування полів; timeline у порядку API; додавання note / message logged / follow-up sent з `occurredAt`.
  - Notes — plain text (без HTML-рендеру).

### M1-17 · Detail actions: next action, archive, delete, job edit
- FR: FR-REM-01, FR-APP-11, FR-APP-12, FR-JOB-05, FR-JOB-06, FR-PRIV-04 · Area: web · Est: 2h · Depends: M1-11, M1-16 · Flow: /feature
- AC:
  - `NextActionPicker` (set / clear); archive/unarchive з undo 10 с.
  - Delete: confirm + undo 10 с (клієнт відкладає `DELETE`; Undo скасовує — тест з fake timers).
  - Редагування/видалення пов'язаної приватної вакансії (confirm), заявка зберігає snapshot.

### M1-18 · Today screen
- FR: FR-DASH-01, FR-REM-02, FR-REM-03 · Area: web · Est: 2h · Depends: M1-12, M0-12 · Flow: /feature
- AC:
  - Overdue (зверху), Today, Upcoming 7 днів; клік → заявка; Done / Snooze (1д, 3д, дата) / Cancel.
  - Landing після входу: `/today`, якщо є due/overdue, інакше `/applications`.

### M1-19 · Hotkeys registry
- FR: FR-PROF-01 · Area: web · Est: 1.5h · Depends: M1-14 · Flow: direct
- AC:
  - Реєстр `lib/hotkeys` (R0 набір `10-frontend-ux.md` §10.3), `G`-послідовності 1 с, не спрацьовують у полях вводу/діалогах; `?` — довідка з реєстру.
  - `hotkeysEnabled = false` вимикає одноклавішні (тест).

### M1-20 · Command palette (Cmd+K)
- FR: — · Area: web · Est: 1.5h · Depends: M1-19 · Flow: direct · **optional**
- AC:
  - `⌘/Ctrl+K`: пошук по заявках + «Add application», команди з реєстру хоткеїв; доступно з клавіатури.
- Notes: у R0 optional, може зсунутися в R1 (`10-frontend-ux.md`).

---

## M2 Migration (тиждень 4) → R0

**E06 Import / Export**

### M2-01 · CSV import domain
- FR: FR-IMP-01, FR-IMP-03, FR-IMP-04 · Area: api · Est: 2.5h · Depends: M1-05, M1-14 · Flow: /feature (test-first)
- Notes: залежність від M1-14 — пріоритет графа `mvp.md` §3 (`KB --> IMP`): імпорт починаємо, коли tracker уже придатний для dogfooding.
- AC:
  - Pure functions: UTF-8 + BOM, роздільник `,`/`;` (автовизначення), автовгадування колонок за заголовками, мапінг значень статусу (→ status / skip), парсинг дат за обраним форматом; неоднозначна дата без формату → помилка рядка.
  - `importKey` = (нормалізований company, role, `appliedAt`); побудова backdated подій (`CREATED`, `STATUS_CHANGED` → `APPLIED` → поточний).
  - Unit-тести, coverage ≥ 90%.

### M2-02 · Import API: preview → commit
- FR: FR-IMP-01, FR-IMP-02, FR-IMP-03, FR-IMP-04 · Area: api · Est: 3h · Depends: M2-01, M1-03, M1-07 · Flow: /feature
- AC:
  - `POST /import/csv/preview` (multipart, `@AcceptsMultipart`, Origin check): > 1 MB / > 5 000 рядків → відмова до парсингу; `ImportSession` з 10 рядками, статусами, форматом; нічого не пишеться в заявки.
  - `POST /import/csv/commit` (IK): повтор сесії → replay; рядки з існуючим `importKey` → skipped; звіт «N created, M skipped, K errors»; події `actor = IMPORT`; прострочена сесія → `409 CONFLICT_STATE`.
  - `GET /import/sessions/:id`; IDOR для всіх трьох; `rows = NULL` після commit.

### M2-03 · Synchronous export CSV / JSON
- FR: FR-IMP-05, FR-IMP-06 · Area: api · Est: 1.5h · Depends: M1-10 · Flow: /feature
- AC:
  - `GET /applications/export?format=csv|json` — стрім, фільтри як у списку; JSON з подіями; CSV RFC 4180, UTF-8 BOM.
  - Formula escaping (`=`,`+`,`-`,`@`, tab, CR, fullwidth) — unit; round-trip: експорт → імпорт → 0 нових (integration).
  - IDOR list-експорт.

### M2-04 · Web: CSV import wizard
- FR: FR-IMP-01, FR-IMP-02 · Area: web · Est: 3h · Depends: M2-02 · Flow: /feature
- AC:
  - `/applications/import`: upload → column mapping → status values + date format → preview з помилками по рядках → commit → `ImportReport`.
  - Повторний commit (подвійний клік/refresh) не дублює (той самий IK); mapping-тести з MSW.

### M2-05 · Onboarding R0 + export UI
- FR: FR-DASH-02, FR-IMP-05 · Area: web · Est: 1h · Depends: M2-04, M2-03 · Flow: direct
- AC:
  - Порожній `/applications` → CTA «Import CSV» і «Add first job»; без кроків профілю.
  - Export CSV/JSON з Table і `/settings/data`.

**E10 Platform & security**

### M2-06 · Rate limiting
- FR: — · Area: api, security · Est: 1.5h · Depends: M0-09 · Flow: /feature
- AC:
  - Redis sliding window: 300 запитів/хв на користувача, `POST /import/csv/preview` 20/год → `429 RATE_LIMITED` + `Retry-After`.
  - Redis недоступний → fail-open in-memory з warning (тест).

### M2-07 · R0 IDOR coverage + security test set
- FR: FR-AUTH-03 · Area: security, api · Est: 1.5h · Depends: M2-02, M2-03, M2-06, M1-12 · Flow: /feature
- AC:
  - IDOR gate зелений для всіх R0 routes; список `@IdorExempt` переглянуто.
  - Тести: headers API, CORS, cookies, CSV injection, redaction, rate limits — усі R0-рядки `11-testing.md` §5.3.

### M2-08 · Synthetic seed (realistic)
- FR: FR-DEMO-01 · Area: db · Est: 1.5h · Depends: M1-11 · Flow: direct
- AC:
  - `seedUserData(tx, userId, opts)` + CLI `pnpm db:seed`: детермінований faker (фіксований seed), реалістичний набір — ~40 заявок у всіх статусах з правдоподібним розподілом (більшість APPLIED/REJECTED/GHOSTED, кілька INTERVIEW/OFFER), вигадані компанії/ролі UA-ринку, канали/origin, події за останні ~8 тижнів, reminders (overdue/today/upcoming), вакансії; тільки синтетика (без реальних людей/компаній).
  - Придатний для скріншотів README (M2-13); `--volume` для k6 (2 000 / 20 000, `11-testing.md` §7). Перевикористовується в M2-12 (demo); integration: seed проходить IDOR-обмеження (дані лише в `userId`).

### M2-09 · Dogfooding polish buffer
- FR: — · Area: web, api · Est: 2h · Depends: M2-05 · Flow: /bugfix
- AC:
  - Імпорт реальної таблиці автора; знайдені баги — окремі `/bugfix` з тестом; loading/error/keyboard доступ на всіх R0 екранах.

### M2-10 · Backup restore test (manual, local)
- FR: — · Area: infra, docs · Est: 1h · Depends: M0-15 · Flow: direct
- AC:
  - Відновлення останнього локального `pg_dump` (`pnpm db:restore`) в ізольований контейнер, `prisma migrate status` актуальний, row counts збігаються з робочою БД; runbook `docs/runbooks/restore.md` (local; розділ «when hosting» — заглушка з посиланням на M5-18).

**E10 Portfolio (ADR 022)**

### M2-12 · Demo sign-in without Google (local)
- FR: FR-DEMO-01, FR-DEMO-06 (банер) · Area: api, web, security · Est: 2.5h · Depends: M2-08, M0-12 · Flow: /feature
- AC:
  - `POST /demo/session` (`@Public`, Origin check): лише при `DEMO_ENABLED=true`, інакше 404; створює `User` з `demoExpiresAt = now + 24 год` (без `Account`, allowlist не зачіпається) + `seedUserData` в одній транзакції + Better Auth сесію з TTL ≤ `demoExpiresAt` (механізм створення сесії перевірити в плані: plugin `anonymous` vs internal adapter — не з пам'яті).
  - Env schema: `NODE_ENV=production` + `DEMO_ENABLED=true` без Turnstile-конфігу → процес не стартує (unit). IDOR між двома demo-користувачами (integration); demo-сесія → 200 на `/me`, `demoExpiresAt` у відповіді.
  - Web: «Try demo» на `/sign-in` (прапорець `VITE_*`), після входу → `/applications`; банер «Demo — data resets in N h» у shell; component-тести (кнопка за прапорцем, банер).
  - Purge, обмеження і Turnstile — M5-12/M5-13 (R1).

### M2-13 · Portfolio README (screenshots/GIF/video, diagram, badges)
- FR: — · Area: docs · Est: 2h · Depends: M2-12, M2-04 · Flow: direct (architect)
- AC:
  - README: що це (1 абзац), GIF Kanban drag + Undo, скріншоти (Applications, Detail, Today, Import), коротке відео 1–2 хв (посилання), архітектурна діаграма (Mermaid), stack, «Key engineering decisions» → ADR, CI badges, quick start (`cp .env.example .env && docker compose up -d && pnpm dev` → Try demo), кнопка «Open in GitHub Codespaces» (після M2-14), «Deploy-ready» (що перевіряє CI; варіанти хостингу — `12-infra-ops.md` §2.1). Знімки — лише на синтетиці seed.
- Notes: оновлюється в кінці R1 (M5-27).

### M2-14 · Devcontainer + Codespaces
- FR: — · Area: repo, infra · Est: 1.5h · Depends: M2-12, M0-04 · Flow: direct
- AC:
  - `.devcontainer/devcontainer.json`: Node 26 + pnpm (`npm i -g pnpm`, без corepack — ADR 024), docker-in-docker (або compose-based), `postCreateCommand`: `pnpm install --frozen-lockfile`, `cp -n .env.example .env`; `postStartCommand`: `docker compose up -d`, `pnpm db:migrate`; forwarded ports 5173/3000 з labels.
  - У Codespaces forwarded-хости портів 5173 і 3000 різні (і, ймовірно, різні sites — перевірити PSL для `app.github.dev`), тож cookie/CORS не покладаються на них: SPA і API на одному origin через Vite dev proxy (`/api` → `:3000`), `APP_ORIGIN`/`trustedOrigins` = forwarded-URL з `CODESPACE_NAME`; перевірено вручну: Try demo → Applications. Codespaces оплачує квота відвідувача (README).

### M2-11 · R0 release
- FR: — · Area: security, docs · Est: 2h · Depends: усі не-optional задачі R0 — M0-01…M0-06, M0-07a, M0-07b, M0-08…M0-12, M0-14, M0-15, M0-17, M1-01…M1-19, M2-01…M2-10, M2-12…M2-14 (поза gate: optional M0-06b, M0-16, M1-20; поза R0: `Later — when hosting`) · Flow: /security-audit → /ship
- AC:
  - `/security-audit` R0 без відкритих high/critical (включно з demo sign-in і production-guard `DEMO_ENABLED`); README (M2-13) актуальний; `CONTEXT.md` оновлено.
  - Deploy-ready checks зелені (multi-arch build, compose config, terraform validate, actionlint); свіжий clone → quick start → Try demo працює без Google credentials.
  - Тег `v0.1.0`, GitHub milestone R0 закрито; ручний smoke-чекліст пройдено (local); старт 7-денного exit-критерію (local).

---

## M3 Capture (тижні 5–6)

**E10 Platform**

### M3-01 · Worker entrypoint
- FR: — · Area: worker, infra · Est: 2h · Depends: M0-02, M2-11 · Flow: /feature
- AC:
  - `worker.ts` (`createApplicationContext(WorkerModule)`), BullMQ wiring за результатом M0-02 (`@nestjs/bullmq` 12 + `bullmq` 6 + `ioredis` 6 — у BullMQ 6 драйвер став optional peer); іменування черг/jobs/scheduler-ів за `04-architecture.md` §5.4 (назва черги без `:`, один processor на чергу з диспатчем за `job.name`); `*.worker-module.ts` конвенція.
  - Graceful shutdown ≤ 30 с; `/health` на :9465 + heartbeat; worker-контейнер у compose і deploy (SIGTERM → close → новий).
  - Integration: processor ідемпотентний за `jobId`.

### M3-03 · AuditLog
- FR: — · Area: api, db, security · Est: 2h · Depends: M3-01 · Flow: /feature
- AC:
  - Міграція + grants (`applyra_app` тільки INSERT/SELECT — тест, що UPDATE падає); `AuditService.record(tx, …)`.
  - Події sign-in/out, session revoke, `IMPORT_COMMITTED`; IP /24; retention 90 днів (maintenance-роль).

> M3-02, M3-02b, M3-04…M3-19 — у `Later — after R1-lite` (ADR 025).

**E04 Capture**

### M3-20 · safe-fetcher service (SSRF)
- FR: FR-JOB-07 · Area: worker, infra, security · Est: 5h · Depends: M3-01 · Flow: /feature (+ security-reviewer)
- AC:
  - Окремий контейнер; URL/port/userinfo правила, `ipaddr.js` allow-only unicast, DNS один раз + undici `lookup` на перевірений IP, redirects ≤ 3 з повною перевіркою, 2 MB decoded, `text/html`, connect 3 с / total 5 с, `ApplyraBot` UA.
  - Мережі `egress` + `fetch-rpc` (у `fetch-rpc` лише worker і safe-fetcher; api — ні), `DOCKER-USER` правила; не резолвить `postgres`/`redis`.
  - Worker-processor черги `capture` викликає safe-fetcher через `fetch-rpc` (ADR 021).
  - Усі SSRF fixtures `11-testing.md` §5.1 зелені в CI; метрика `capture_fetch_total{result}`.
- Notes: ADR 009, ADR 021, `09-security-privacy.md` §5; G-02 resolved.

### M3-21 · Capture API: domain policy + JSON-LD → JobDraft
- FR: FR-JOB-07, FR-JOB-09 · Area: api, contracts · Est: 3.5h · Depends: M3-20, M1-04 · Flow: /feature
- AC:
  - `POST /jobs/capture` (IK, 30/год; `no-demo` — з M5-12, коли хостимо: у R1-lite demo лише local, ADR 025): API ставить BullMQ job `capture/capture` зі стабільним `jobId` (`capture-<sha256>`) і чекає результат ≤ 6 с; fetch робить лише worker (ADR 021); тайм-аут → `504 CAPTURE_TIMEOUT` (`06-api.md` §3.1, ADR 021). Integration: повтор із тим самим IK не ставить другий job.
  - LinkedIn paste-only, `robots.txt` для UA, denylist конфігом → «Paste the job text instead».
  - JSON-LD `JobPosting` mapper (фікстури) → `JobDraft` з `source` + confidence на поле; нічого не зберігається.
  - Недоступна сторінка → `422 CAPTURE_UNAVAILABLE` без повторів; captured — завжди PRIVATE.
  - Опис з JSON-LD (HTML) → plain text у `descriptionText` (теги видалено, unit на фікстурах з `<script>`/`<img onerror>`); `descriptionHtml` = null. Sanitized HTML — M4-11 (Later, ADR 025).

### M3-22 · Web: URL capture
- FR: FR-JOB-07, FR-AI-05 · Area: web · Est: 2.5h · Depends: M3-21, M1-13 · Flow: /feature
- AC:
  - Вкладка URL: `CapturePreview` з `FieldSourceBadge`; поля редагуються, збереження лише після підтвердження; помилка → перехід на Paste text.

**E2E**

### M3-23 · Playwright infrastructure
- FR: — · Area: e2e, ci · Est: 2.5h · Depends: M2-12, M3-20 · Flow: /e2e
- AC:
  - Workspace `e2e` (з M0-01, pinned `@playwright/test`) + `@axe-core/playwright`; `compose.ci.yml` (production images, Caddy з headers, worker + safe-fetcher, stub LLM, stub capture-сайт; Mailpit — з M3-04, Later); вхід через demo sign-in (M2-12); `e2e/seed.spec.ts`.
  - CI job на PR; trace on first retry, 1 retry тільки в CI; role-based locators.
- Notes: після інсталяції перевірити `.mcp.json` playwright-test (`CONTEXT.md` §6).

### M3-24 · E2E flows 1, 3, 4
- FR: FR-APP-05, FR-APP-06, FR-IMP-02, FR-AUTH-03 · Area: e2e · Est: 3h · Depends: M3-23 · Flow: /e2e
- AC:
  - Flow 1 (demo sign-in → onboarding R0 → paste job → application → drag → Undo → Move to (keyboard) → next action → Today → export), axe на кожному екрані, desktop + 375px. Email sign-up — разом із M3-05 (Later, ADR 025).
  - Flow 3 (CSV import + повтор без дублів), flow 4 (другий demo-користувач B: UI + прямі URL → 404).

### M3-25 · E2E flow 2 (capture)
- FR: FR-JOB-07 · Area: e2e · Est: 1h · Depends: M3-22, M3-23 · Flow: /e2e
- AC:
  - Stub-сайт з JSON-LD → preview → save; сторінка без JSON-LD → «Paste the job text instead».

---

## M4 Profile, Matching & AI (тижні 7–8)

**E07 Profile & Skills**

### M4-01 · Profile & skills schema
- FR: FR-PROF-03, FR-PROF-04, FR-PROF-05 · Area: db · Est: 1.5h · Depends: M2-11 · Flow: /feature (`/prisma-migration`)
- AC:
  - `CareerProfile` (повна таблиця за `05-data-model.md`, щоб M4-03b не мігрував її знову), `Skill`, `SkillAlias`, `UserSkill`, `JobSkill` (з R2, ADR 025); unique (user, skill), (job, skill); trigram на name/alias. `Experience`/`Education`/`Language` — M4-03b (Later).

### M4-02 · Skills catalogue + search
- FR: FR-PROF-04 · Area: api, db · Est: 3h · Depends: M4-01 · Flow: /feature
- AC:
  - Seed ≥ 300 навичок з aliases (`node`, `nodejs`, `node.js` → `Node.js`), ідемпотентний; `SkillsService.normalize`, `extractFromText` (словник, unit).
  - `GET /skills/search?q=` по name + aliases повертає канонічну навичку.
- Notes: джерело списку — gap G-07.

### M4-03 · Career profile API (narrowed, ADR 025)
- FR: FR-PROF-03, FR-PROF-05 (частково) · Area: api, contracts · Est: 1.5h · Depends: M4-01 · Flow: /feature
- AC:
  - `GET/PATCH /profile` лише з полями для matching-lite: `seniority`, `targetRoles`, `workModes`, `employmentTypes`; профіль створюється ліниво (upsert), scoped by `userId`.
  - Timezone відсутній у профілі; невідомі поля → `400 VALIDATION_ERROR`.
  - Решта (personal/links, experience, education, languages, salary, `hardFilters`) — M4-03b (Later).

### M4-04 · User skills API
- FR: FR-PROF-04 · Area: api · Est: 1.5h · Depends: M4-02 · Flow: /feature
- AC:
  - `GET /profile/skills`, `PUT/DELETE /profile/skills/:skillId` (level 1–5, years, lastUsed, preference); дубль неможливий; IDOR.

### M4-05 · Web: Profile (narrowed, ADR 025)
- FR: FR-PROF-03, FR-PROF-05 (частково) · Area: web · Est: 2h · Depends: M4-03 · Flow: /feature
- AC:
  - `/profile`: seniority, target roles, work modes, employment types (RHF + contracts) + місце під секцію skills (M4-06); empty state з CTA; responsive; пункт навігації Profile.
  - Решта секцій — M4-05b (Later).

### M4-06 · Web: skills combobox
- FR: FR-PROF-04 · Area: web · Est: 2h · Depends: M4-04, M4-05 · Flow: /feature
- AC:
  - `SkillCombobox` (alias → канонічна, keyboard, ARIA combobox), список навичок з level/preference.

### M4-08 · Skill extraction on job write (sync, ADR 025)
- FR: FR-PROF-04, FR-MATCH-01 (передумова) · Area: api · Est: 2h · Depends: M4-02 · Flow: /feature
- AC:
  - Jobs-сервіс у тій самій транзакції, що create/update job (`POST /jobs`, inline job у `POST /applications`, `PATCH /jobs/:id`, збереження captured job), викликає `skills.extractFromText` (через `index.ts` модуля skills) → replace `JobSkill` (source `DICTIONARY`, REQUIRED/NICE за 08 §9); повтор/IK-replay не дублює (integration).
  - Ідемпотентний backfill-скрипт `JobSkill` для R0-вакансій.
- Notes: без outbox; перехід на consumer `JobCreated`/`JobUpdated` — разом з M3-02b (Later).

> M4-07, M4-09…M4-18 — у `Later — after R1-lite` (ADR 025).

**E12 Matching-lite (ADR 025)**

### M4-24 · Matching-lite: domain + `GET /jobs/:id/match`
- FR: FR-MATCH-01 (без exclusion), FR-MATCH-02, FR-MATCH-05 · Area: api, contracts · Est: 4h · Depends: M4-03, M4-04, M4-08 · Flow: /feature (test-first)
- AC:
  - `matching/score.domain.ts` (чисті функції, ≥ 90% coverage): компоненти Skills 0.35 / Seniority 0.20 / Work mode 0.15 / Employment type 0.05 за 08 §8.1; `null` = unknown знижує confidence, не score; confidence = Σw(known) / 0.75; `excludedReasons` = []; `algorithmVersion = 'v1.0-lite'`.
  - `MatchExplanation` (Zod у contracts, 08 §8.3) зі strengths/gaps/unknowns, детерміновані тексти; golden set ≥ 20 пар (профіль, вакансія) з очікуваними діапазонами score/confidence.
  - `GET /jobs/:id/match` рахує при читанні (без `MatchScore`); чужа/неіснуюча вакансія → 404 (IDOR-тест); без профілю/skills → `score: null` + unknowns, не помилка.

### M4-25 · Web: match badge + «Why?»
- FR: FR-MATCH-03 · Area: web · Est: 2h · Depends: M4-24, M1-16 · Flow: /feature
- AC:
  - У detail заявки (секція job) бейдж Strong ≥ 80 / Good ≥ 60 / Weak; confidence < 0.4 → «Not enough data»; popover/disclosure «Why?» з компонентами, strengths/gaps/unknowns; CTA «Complete profile» → `/profile`.
  - Loading/error стани; keyboard + ARIA; тести з MSW.

**E13 AI**

### M4-19 · AI module: provider, executor, budgets
- FR: FR-AI-05, FR-AI-06, FR-AI-07 · Area: api, db · Est: 5h · Depends: M2-11 · Flow: /feature (`/ai-task`)
- AC:
  - `AIProvider`, `StubProvider`; `defineTask` registry; executor: `AI_MODE` → global cap → user budget → policy (aiEnabled) → cache → provider → Zod + repair → `AiRun`.
  - Demo-користувач → `StubProvider` (`07-ai.md` §4.3; раніше в M5-12, ADR 025).
  - `AiUsageDaily`/`AiGlobalUsageDaily` атомарний reserve/settle/release (integration на конкурентність); перевищення → `429 AI_BUDGET_EXCEEDED` / `AI_DISABLED`, provider не викликається, `AiRun = BUDGET_EXCEEDED`.
  - AI вимкнено → жодного виклику (перевірка в executor).
- Notes: `07-ai.md` §4–§9, ADR 017.

### M4-20 · `extract-job` task + golden set
- FR: FR-AI-01 · Area: api · Est: 3.5h · Depends: M4-19 · Flow: /feature (`/ai-task`)
- AC:
  - Схема JSON-schema-safe, delimited untrusted input, `promptVersion`; невалідний вивід після repair → чернетка без LLM-полів, не 500.
  - Golden set ≥ 20 вакансій + injection-кейси; `pnpm --filter api ai:eval` (manual) з JSON-звітом.

### M4-21 · Provider adapter (one provider, ADR 025)
- FR: FR-AI-01 · Area: api, docs · Est: 2h · Depends: M4-20 · Flow: /feature
- AC:
  - Адаптер одного провайдера, обраного власником до старту задачі; прогін golden set дає pass rate ≥ порогу (поріг у плані задачі), cost і latency записано; no-training/retention — у follow-up ADR 017; моделі в конфігу (`AI_MODEL_FAST`); `AIProvider` лишається змінним.
  - Другий адаптер і порівняння — M4-21b (Later).

### M4-22 · Capture LLM fallback + «Context used»
- FR: FR-JOB-08, FR-AI-03, FR-AI-05 · Area: api, web · Est: 2h · Depends: M4-20, M3-22 · Flow: /feature
- AC:
  - Немає JSON-LD / бракує полів і є текст → `extract-job`; поля `llm` + confidence не зберігаються без підтвердження.
  - AI вимкнено → чернетка лише з JSON-LD / порожня без помилки; «Context used» = фактичний контекст (contract-тест).

### M4-23 · AI settings + usage
- FR: FR-PRIV-03, FR-AI-06, FR-AI-07 · Area: api, web · Est: 2h · Depends: M4-19, M3-03 · Flow: /feature
- AC:
  - `PATCH /me/settings` (`aiEnabled`, `aiAllowedProfileParts`) + audit `AI_SETTINGS_CHANGED`; заборонені частини ніколи в контексті (contract-тест).
  - `/settings/ai`, `GET /ai/usage` (сьогодні / ліміт).

---

## M5 Launch (тиждень 9) → R1-lite

> M5-01…M5-13, M5-15, M5-16, M5-23, M5-24 — у `Later — after R1-lite` (ADR 025). M5-17 (WAL-G), M5-18 (restore-test workflow), M5-20 (staging + release) — у `Later — when hosting`; M5-19 закрито (Terraform-код — M0-17, plan/apply і remote state — M0-13). ADR 022.

**E10 Ops & observability**

### M5-14 · Sentry web/worker (narrowed, ADR 025) · **optional**
- FR: — · Area: obs, web · Est: 1h · Depends: M0-15, M3-01 · Flow: direct
- AC:
  - Sentry web + worker — лише при DSN (ADR 022); sourcemaps генеруються і видаляються з `dist`; CSP `connect-src` для Sentry у `_headers` і Caddy-static. Turnstile/report-to і nightly header check — з M5-12 (Later).

**E2E / QA**

### M5-21 · `@smoke` suite (narrowed, ADR 025)
- FR: — · Area: e2e, ci · Est: 1h · Depends: M3-24 · Flow: /e2e
- AC:
  - `@smoke` (health, demo sign-in, Applications, створити й видалити заявку, headers) post-merge проти `compose.ci.yml`; запуск проти hosted-середовища — M5-20 (when hosting). Flows 5, 6 — M5-21b (Later).

### M5-22 · OpenAPI ↔ route table + oasdiff
- FR: — · Area: contracts, ci · Est: 2h · Depends: M3-21, M4-23, M4-24 · Flow: /feature
- AC:
  - OpenAPI з nestjs-zod; тест: кожен route задокументований, немає «примарних» шляхів; `oasdiff breaking` проти `main` у CI (OWASP API9 [R1], `09-security-privacy.md`).

### M5-25 · Accessibility + responsive pass
- FR: — · Area: web · Est: 2.5h · Depends: M3-22, M4-06, M4-23, M4-25 · Flow: /feature (ui-reviewer)
- AC:
  - WCAG 2.2 AA на R0- і R1-lite-екранах (capture, Profile, skills, match, AI settings; axe без порушень, фокус, контраст, 2.5.7 альтернативи drag); 375px без горизонтального скролу.

**Docs & release**

### M5-26 · Bot page + data-flow page (narrowed, ADR 025)
- FR: — · Area: docs, web · Est: 1h · Depends: M4-21 · Flow: direct
- AC:
  - `/bot` для `ApplyraBot` UA; сторінка «How your data is used»: що йде в LLM-провайдера (і no-training/retention з ADR 017 follow-up), AI settings, локальні бекапи; посилання з sign-in і footer. Повна privacy policy — M5-26b (Later).

### M5-27 · README refresh (R1-lite), ADRs, demo script
- FR: — · Area: docs · Est: 2h · Depends: M2-13, M4-22, M4-25 · Flow: direct (architect)
- AC:
  - README з M2-13 оновлено: скріншоти/GIF R1-lite (capture → draft → match «Why?», AI settings), нове відео 2 хв, діаграма з worker/safe-fetcher, security highlights (SSRF, LLM budgets/injection); Codespaces-шлях перевірено.
  - ADR-індекс актуальний (рішення спайків, провайдер LLM); 2-хвилинний demo-сценарій у `docs/demo.md`.

### M5-28 · R1-lite release
- FR: — · Area: security, docs · Est: 3h · Depends: усі не-optional задачі R1-lite — M3-01, M3-03, M3-20…M3-25, M4-01…M4-06, M4-08, M4-19…M4-25, M5-21, M5-22, M5-25…M5-27 (поза gate: optional M5-14; поза R1-lite: обидва розділи `Later`) · Flow: /security-audit → /ship
- AC:
  - `/security-audit` (OWASP API мапінг, SSRF, LLM injection/budgets, demo production-guard) без відкритих high/critical; fixes — окремими PR.
  - CI зелений (включно з deploy-ready checks, SSRF fixtures, E2E); тег `v1.0.0`; exit-критерій R1-lite (README/Codespaces → demo → capture → match за 2 хв) перевірено на незнайомій людині.

---

## Later — after R1-lite

ADR 025: R1-задачі поза R1-lite. ID збережено; GitHub milestone `Later`, label `later-r1l`. Не входять у gate M5-28 і в підсумок R1-lite. Беруться за цінністю або разом із хостингом (тоді — разом із `Later — when hosting`). Передумови R2: M3-02, M3-02b, M4-07, M4-09, M4-10, M4-03b. AC нижче — до звуження; при поверненні задачі перевірити залежності (жодна з них не блокує R1-lite).

| ID | Назва | Est | Причина відкладення |
|---|---|---|---|
| M3-02 | Transactional outbox | 3h | немає consumer-а в R1-lite (skill extraction синхронна) |
| M3-02b | Outbox producers in R0 code | 2h | без M3-02 |
| M3-04 | Email infrastructure | 2h | немає email-фіч без password auth/notifications |
| M3-05 | Email + password sign-up / sign-in | 3h | лише Google + demo; знімає поверхню паролів |
| M3-06 | Reset / change password | 2h | без M3-05 |
| M3-07 | Auth rate limits | 1.5h | без M3-05 |
| M3-08 | Google ↔ email linking | 1.5h | без M3-05 |
| M3-09 | Sessions management + re-auth | 2.5h | потрібне для export/delete, теж відкладених |
| M3-10 | Web: auth screens, sessions, re-auth | 3h | без M3-05/M3-09 |
| M3-11 | Stale hints | 2.5h | CRM-полірування, не showcase |
| M3-12 | Edit / delete timeline events | 2.5h | залежить від outbox; CRM-полірування |
| M3-13 | Contacts | 3.5h | CRM-розширення |
| M3-14 | Interviews API + auto-reminders | 3h | CRM-розширення |
| M3-15 | Interviews UI + `.ics` | 2.5h | без M3-14 |
| M3-16 | Custom reminders + follow-up templates | 2h | CRM-розширення |
| M3-17 | Notification centre | 3h | нотифікації — для багатокористувацького продукту |
| M3-18 | Reminder delivery + quiet hours | 3h | без M3-17 |
| M3-19 | Outbox consumers → in-app | 1h | без M3-02/M3-17 |
| M4-03b | Career profile: решта (personal/links, experience, education, languages, salary, hard filters) | 1.5h | matching-lite не використовує |
| M4-05b | Web: Profile — решта секцій | 2h | без M4-03b |
| M4-07 | Jobs search schema (Company, UserJob, search_vector) | 2h | match показується в detail заявки, список не потрібен |
| M4-09 | `GET /jobs` (JobQuery) | 4h | без Jobs list |
| M4-10 | UserJob state + companies autocomplete | 2h | без Jobs list |
| M4-11 | Sanitized job HTML | 1.5h | captured опис — plain text |
| M4-12 | Web: Jobs list + filters | 4h | не потрібен для match |
| M4-13 | Web: Job detail | 2.5h | match — у detail заявки |
| M4-14 | Documents: schema, storage, upload | 3.5h | documents не в showcase; без upload — менша поверхня атаки |
| M4-15 | Validate + parse sandbox | 4h | без M4-14 |
| M4-16 | Download, delete, default CV | 2.5h | без M4-14 |
| M4-17 | Application ↔ DocumentVersion | 1.5h | без M4-16 |
| M4-18 | Web: Documents | 3h | без M4-16 |
| M4-21b | Другий AI-адаптер + порівняння | 1h | вистачає одного провайдера |
| M5-01 | Analytics API | 4h | insights — після CRM-розширень |
| M5-02 | Web: Analytics | 2.5h | без M5-01 |
| M5-03 | Dashboard API | 2.5h | залежить від interviews/stale |
| M5-04 | Web: Dashboard + R1 navigation | 3h | без M5-03; R0-навігація + Profile достатньо |
| M5-05 | Onboarding R1 | 1.5h | без повного профілю |
| M5-06 | Email reminders, digest, unsubscribe | 4h | без email/notifications |
| M5-07 | Web: notification preferences | 1.5h | без M5-06 |
| M5-08 | Full async export (zip) | 3.5h | R0 sync export вистачає; потрібне при хостингу |
| M5-09 | Account deletion pipeline | 4h | потрібне при хостингу (чужі дані) |
| M5-10 | Retention schedulers | 2h | без M5-09; AuditLog retention — у M3-03 |
| M5-11 | Web: Settings → Data | 1.5h | без M5-08/M5-09 |
| M5-12 | Demo restrictions + anti-abuse | 3h | demo лише local (production-guard M2-12) |
| M5-13 | Demo purge + «Request access» | 2h | без M5-12 |
| M5-15 | Metrics instrumentation | 3h | Prometheus відкладено |
| M5-16 | Prometheus / Grafana / Alertmanager | 4h | ops-showcase поступається capture/AI/matching |
| M5-21b | E2E flows 5, 6 | 1h | без M5-09/M5-12 |
| M5-23 | k6 + Lighthouse nightly · optional | 2h | optional; без staging |
| M5-24 | Admin TOTP + Bull Board · optional | 2h | optional; без admin-ролі в R1-lite |
| M5-26b | Повна privacy policy | 0.5h | потрібна при хостингу |

Разом: 122 год core + 4 год optional.

### Deferred task bodies (AC as of 2026-11-16)

### M3-02 · Transactional outbox · `later-r1l`
- FR: — · Area: worker, db · Est: 3h · Depends: M3-01 · Flow: /feature
- AC:
  - `OutboxEvent` міграція + partial index; `OutboxWriter.append(tx, …)`; relay claim (`FOR UPDATE SKIP LOCKED`, коротка tx) → publish (`jobId = <eventId>_<consumer>`, `consumer` = `<queue>-<job>` — BullMQ забороняє `:` у custom jobId) → mark/backoff; dead після 10.
  - Integration: crash між publish і mark → без дубля; Redis down → події накопичуються й доганяються; scheduler `outbox:cleanup` (job `outbox/cleanup`) 7 днів.
- Notes: `04-architecture.md` §5.2, ADR 006.

### M3-02b · Outbox producers in R0 code · `later-r1l`
- FR: FR-NOTIF-01, FR-DISC-01 · Area: api, contracts · Est: 2h · Depends: M3-02 · Flow: /feature
- AC:
  - Payload-схеми подій (Zod у contracts: ids + `occurredAt` + версія) для `JobCreated`, `JobUpdated` (M1-04, M1-06), `ApplicationStatusChanged` (M1-08; CSV import не емітить), `ImportCommitted` (M2-02) — `04-architecture.md` §5.3.
  - `outbox.append(tx, …)` у тій самій `$transaction`, що й мутація; синхронні R0-ефекти (A-03) і синхронна skill extraction M4-08 переводяться на події лише свідомо.
  - Integration на кожен producer: рядок записано разом з мутацією; rollback → рядка немає; IK-replay → без другого рядка.

### M3-04 · Email infrastructure · `later-r1l`
- FR: FR-NOTIF-02 · Area: api, worker · Est: 2h · Depends: M3-01 · Flow: /feature
- AC: `EmailSender` (Mailpit локально, provider adapter — when hosting), черга `email`, job `send` з ідемпотентним `jobId`; шаблони (text + HTML); вибір Resend vs Postmark зафіксовано.

### M3-05 · Email + password sign-up / sign-in + verification · `later-r1l`
- FR: FR-AUTH-05, FR-AUTH-07, FR-AUTH-02 · Area: api, security · Est: 3h · Depends: M3-04, M3-03 · Flow: /feature
- AC: пароль 12–128, HIBP (k-anonymity); allowlist; verification email. Enumeration-safe відповіді, sign-up на зайнятий email = успіх + лист власнику, dummy-hash. До верифікації export/delete/linking → відхилено.

### M3-06 · Reset password + change password · `later-r1l`
- FR: FR-AUTH-06, FR-AUTH-09 · Area: api, security · Est: 2h · Depends: M3-05 · Flow: /feature
- AC: токен одноразовий, TTL 30 хв, однакова відповідь для будь-якого email; reset/change інвалідують інші сесії; audit `PASSWORD_*`.

### M3-07 · Auth rate limits · `later-r1l`
- FR: FR-AUTH-07 · Area: api, security · Est: 1.5h · Depends: M3-05, M2-06 · Flow: /feature
- AC: sign-in 5/хв на (IP, email) і 30/год на IP; reset 3/год на email; sign-up 10/год на IP → 429.

### M3-08 · Google ↔ email account linking · `later-r1l`
- FR: FR-AUTH-08 · Area: api, security · Est: 1.5h · Depends: M3-05 · Flow: /feature
- AC: автолінк лише при `email_verified` з обох сторін; інакше `409 ACCOUNT_LINK_REQUIRES_VERIFICATION`; audit `ACCOUNT_LINKED`.

### M3-09 · Sessions management + re-auth · `later-r1l`
- FR: FR-AUTH-09, FR-AUTH-10 · Area: api · Est: 2.5h · Depends: M3-06 · Flow: /feature
- AC: `list-sessions`, `revoke-session`, revoke all others, `POST /api/auth/revoke-sessions`; audit. `@RequireRecentAuth` (freshAge 10 хв) → `403 FRESH_SESSION_REQUIRED`; route-table тест для `fresh` routes.

### M3-10 · Web: auth screens, sessions, re-auth · `later-r1l`
- FR: FR-AUTH-05, FR-AUTH-06, FR-AUTH-09, FR-AUTH-10 · Area: web · Est: 3h · Depends: M3-09 · Flow: /feature
- AC: `/sign-in` (Google + email/password), sign-up, verify, forgot/reset; `/settings/sessions`, change password; `ReauthDialog` на `FRESH_SESSION_REQUIRED`.

### M3-11 · Stale hints · `later-r1l`
- FR: FR-APP-14 · Area: api, web · Est: 2.5h · Depends: M1-10, M1-14 · Flow: /feature
- AC: domain (unit): пороги з `UserSettings`, `staleGhostDays` → «Mark as ghosted?», dismiss до `staleDismissedUntil`, нова активність знімає dismiss; статус система не змінює. `POST /applications/:id/stale/dismiss` (IDOR); hint у list/detail.

### M3-12 · Edit / delete timeline events · `later-r1l`
- FR: FR-APP-15 · Area: api, web · Est: 2.5h · Depends: M1-09, M1-16, M3-02b · Flow: /feature
- AC: `PATCH /applications/:id/events/:eventId` (текст + `occurredAt` для NOTE/MESSAGE/FOLLOW_UP; лише `occurredAt` для `STATUS_CHANGED`); `DELETE` останнього `STATUS_CHANGED` → статус `fromStatus` + `ApplicationStatusChanged` в outbox, `CREATED` → 409; `lastActivityAt` перераховується; `TimelineEventEditor`; IDOR.

### M3-13 · Contacts · `later-r1l`
- FR: FR-APP-16 · Area: db, api, web · Est: 3.5h · Depends: M1-06 · Flow: /feature
- AC: міграція `Contact`, `ApplicationContact`; CRUD `/contacts` (cursor, `q`), link/unlink; повне видалення контакту; вкладка Contacts; IDOR (link чужого → 404).

### M3-14 · Interviews API + auto-reminders · `later-r1l`
- FR: FR-INT-01, FR-INT-02, FR-INT-05 · Area: db, api · Est: 3h · Depends: M1-11 · Flow: /feature
- AC: міграція `Interview`; CRUD, подія `INTERVIEW_SCHEDULED`, `meetingUrl` лише http(s); авто-reminders 24 год / 1 год; `GET /interviews?from&to` (≤ 92 дні); IDOR. Notes: gap G-04.

### M3-15 · Interviews UI + debrief + `.ics` · `later-r1l`
- FR: FR-INT-01, FR-INT-03, FR-INT-04 · Area: api, web · Est: 2.5h · Depends: M3-14 · Flow: /feature
- AC: вкладка Interviews, debrief-шаблон; `GET /interviews/:id/ics` (стабільний UID, TZ, unit); ручна перевірка Google Calendar + Outlook.

### M3-16 · Custom reminders + follow-up templates · `later-r1l`
- FR: FR-REM-04, FR-REM-07 · Area: api, web · Est: 2h · Depends: M1-11, M1-18 · Flow: /feature
- AC: `source = MANUAL`, опційно з заявкою, не впливають на `nextAction*`; статичні шаблони лише «Copy» / `mailto:`.

### M3-17 · Notification centre · `later-r1l`
- FR: FR-NOTIF-01 · Area: db, api, web · Est: 3h · Depends: M3-02 · Flow: /feature
- AC: міграція `Notification` (`dedupeKey`), `NotificationPreference`; `notify` ідемпотентний; `GET /notifications`, `PATCH /:id/read`, `POST /read-all`; дзвіночок; IDOR.

### M3-18 · Reminder delivery + quiet hours · `later-r1l`
- FR: FR-REM-05, FR-REM-06, FR-PROF-02 · Area: worker, api · Est: 3h · Depends: M3-17 · Flow: /feature
- AC: scheduler `reminders:scan-due` щохвилини; `ReminderDelivery` unique (reminder, dueAt, channel); quiet hours (22:00–08:00, вимикаються) відкладають доставку (unit з DST).

### M3-19 · Outbox consumers → in-app · `later-r1l`
- FR: FR-NOTIF-01 · Area: worker · Est: 1h · Depends: M3-17, M3-02b · Flow: /feature
- AC: `ApplicationStatusChanged`, `ImportCommitted` → notifications; consumer читає поточний стан, видалений агрегат → no-op.

### M4-03b / M4-05b · Career profile: решта (API + web) · `later-r1l`
- FR: FR-PROF-03, FR-PROF-05 · Area: db, api, web · Est: 1.5h + 2h · Depends: M4-03, M4-05 · Flow: /feature
- AC: міграція `Experience`, `Education`, `Language`; `PATCH /profile` + personal/links (лише http(s)), salary, preferences з `hardFilters` окремо від значень; experiences/educations CRUD, `PUT /profile/languages` (CEFR); IDOR для `:id`; web-секції з позначкою hard/soft.

### M4-07 · Jobs search schema · `later-r1l`
- FR: FR-DISC-02, FR-JOB-10 · Area: db · Est: 2h · Depends: M4-01 · Flow: /feature (`/prisma-migration`)
- AC: `Company`, `UserJob`; `search_vector` generated (`f_unaccent`) + GIN, trigram на title/company (`05-data-model.md` §7.3); squawk зелений; створення `UserJob` у jobs-сервісі + ідемпотентний backfill для R0-вакансій (G-08). (`JobSkill` уже створено в M4-01.)

### M4-09 · `GET /jobs` (JobQuery) · `later-r1l`
- FR: FR-DISC-01…04 · Area: api, contracts · Est: 4h · Depends: M4-07, M4-08 · Flow: /feature
- AC: FTS + trigram (`Reakt` → `React Developer`, integration); фільтри AND (work mode, seniority, salary disclosed, employment type, country, date posted, source, skills include/exclude, excluded companies, saved/hidden); sort newest/relevance; keyset cursor без дублів; IDOR list.

### M4-10 · UserJob state + companies autocomplete · `later-r1l`
- FR: FR-JOB-10 · Area: api · Est: 2h · Depends: M4-07 · Flow: /feature
- AC: `PATCH /jobs/:id/user-state` (saved, hidden, reason, note); `viewedAt`; `GET /companies/search?q=`; IDOR.

### M4-11 · Sanitized job HTML · `later-r1l`
- FR: FR-DISC-05 · Area: api, web, security · Est: 1.5h · Depends: M4-07 · Flow: /feature
- AC: `sanitize-html` на запис з allowlist `09-security-privacy.md` §7; `SafeHtml`; XSS fixtures — unit.

### M4-12 · Web: Jobs list + filters · `later-r1l`
- FR: FR-DISC-01, FR-DISC-03, FR-JOB-10 · Area: web · Est: 4h · Depends: M4-09, M4-10 · Flow: /feature
- AC: `/jobs`: `FilterPanel`, `JobCard` (+ match-бейдж з M4-25), пошук, стан у URL, infinite scroll; save/hide; empty/loading/error; MSW-тести.

### M4-13 · Web: Job detail · `later-r1l`
- FR: FR-DISC-05 · Area: web · Est: 2.5h · Depends: M4-11, M4-12 · Flow: /feature
- AC: `/jobs/:id` (split view ≥ 1280px): поля, `SafeHtml`, note, «Create application», «Open original» (`rel=noopener`), match «Why?».

### M4-14 · Documents: schema, storage, upload init/complete · `later-r1l`
- FR: FR-DOC-01, FR-DOC-02 · Area: db, api · Est: 3.5h · Depends: M3-02 · Flow: /feature
- AC: spike presigned PUT (M0-16), інакше fallback через API (ADR 010); `Document`, `DocumentVersion`; storage client, quarantine 1 день; `POST /documents/uploads` (no-demo) → presigned PUT ≤ 5 хв; `.../complete` → HEAD → outbox `DocumentUploaded` → consumer `documents/validate` (ідемпотентний за `versionId`); `/health/ready` + storage HEAD; IDOR.

### M4-15 · Validate + parse sandbox · `later-r1l`
- FR: FR-DOC-01, FR-DOC-04 · Area: worker, security · Est: 4h · Depends: M4-14 · Flow: /feature (+ security-reviewer)
- AC: magic bytes ↔ MIME, `.docm`/зашифрований PDF → REJECTED + delete; parse у child process (256 MB, 20 с SIGKILL, env очищений, без мережі); `parsedText` ≤ 200 000; fixtures `11-testing.md` §5.2.

### M4-16 · Download, delete, default CV · `later-r1l`
- FR: FR-DOC-02, FR-DOC-05, FR-DOC-06 · Area: api · Est: 2.5h · Depends: M4-15 · Flow: /feature
- AC: `GET /documents`, `GET/PATCH/DELETE /documents/:id`, download URL ≤ 5 хв лише READY, audit `DOCUMENT_DOWNLOADED`; `DocumentDeleted` → об'єкт видалено ≤ 1 год; IDOR.

### M4-17 · Application ↔ DocumentVersion · `later-r1l`
- FR: FR-DOC-03 · Area: api, web · Est: 1.5h · Depends: M4-16, M1-16 · Flow: /feature
- AC: заявка посилається на конкретну версію; видалена → «CV version deleted»; вкладка CV; IDOR.

### M4-18 · Web: Documents · `later-r1l`
- FR: FR-DOC-01, FR-DOC-02, FR-DOC-06 · Area: web · Est: 3h · Depends: M4-16 · Flow: /feature
- AC: `/profile/documents`: upload з прогресом, статус, версії, default, download, delete з confirm.

### M4-21b · Second AI adapter + comparison · `later-r1l`
- FR: FR-AI-01 · Area: api, docs · Est: 1h · Depends: M4-21 · Flow: /feature
- AC: адаптер другого кандидата; golden set (pass rate, cost, latency) порівняно; рішення в ADR 017 follow-up.

### M5-01 · Analytics API · `later-r1l`
- FR: FR-ANL-01…05 · Area: api · Est: 4h · Depends: M2-02 · Flow: /feature (test-first)
- AC: funnel за досягнутими стадіями (domain unit + integration); response rate, сегменти channel/origin, median time-to-first-response, `insufficientData` при n < 5; `GET /analytics/overview|funnel|channels?from&to`; IDOR list.

### M5-02 · Web: Analytics · `later-r1l`
- FR: FR-ANL-01, FR-ANL-05 · Area: web · Est: 2.5h · Depends: M5-01 · Flow: /feature
- AC: Recharts funnel/bar + таблична альтернатива, фільтр періоду, «not enough data».

### M5-03 · Dashboard API · `later-r1l`
- FR: FR-DASH-03, FR-INT-05 · Area: api · Est: 2.5h · Depends: M5-01, M3-14, M3-11 · Flow: /feature
- AC: `GET /dashboard`: Today, інтерв'ю 7 днів, pipeline counts, needs attention, this week; числа = Analytics.

### M5-04 · Web: Dashboard + R1 navigation · `later-r1l`
- FR: FR-DASH-03 · Area: web · Est: 3h · Depends: M5-03 · Flow: /feature
- AC: `/dashboard` (StatCard, PipelineBar, quick actions); навігація R1, landing `/dashboard`, хоткеї `G→D/J/P/Y`.

### M5-05 · Onboarding R1 · `later-r1l`
- FR: FR-DASH-04 · Area: web · Est: 1.5h · Depends: M4-05b, M4-06 · Flow: /feature
- AC: 3 кроки (target role + work mode + salary → skills top 10 → Import / Add job), кожен пропускається.

### M5-06 · Email reminders, daily digest, unsubscribe · `later-r1l`
- FR: FR-NOTIF-01…04, FR-REM-06 · Area: worker, api · Est: 4h · Depends: M3-04, M3-18 · Flow: /feature
- AC: scheduler `notifications:digest` о 08:00 локального часу; quiet hours відкладають email (unit з DST); one-click unsubscribe (signed token, `List-Unsubscribe`); `notifications:scan-stale` → `STALE_APPLICATION` (G-05).

### M5-07 · Web: notification preferences · `later-r1l`
- FR: FR-NOTIF-02, FR-PROF-02 · Area: web · Est: 1.5h · Depends: M5-06 · Flow: direct
- AC: `/settings/notifications`: матриця, quiet hours.

### M5-08 · Full async export (zip) · `later-r1l`
- FR: FR-PRIV-01, FR-AUTH-10 · Area: api, worker · Est: 3.5h · Depends: M3-09, M4-16 · Flow: /feature
- AC: `POST /me/export` (fresh, no-demo, 3/добу, один активний) → `202`; `export/build-zip` (JSON + CV) у S3; `EXPORT_READY`; `GET /me/exports/:id` → signed URL ≤ 5 хв, 24 год → `EXPIRED`; audit; IDOR.

### M5-09 · Account deletion pipeline · `later-r1l`
- FR: FR-PRIV-02, FR-AUTH-10 · Area: api, worker, security · Est: 4h · Depends: M3-09, M4-16 · Flow: /feature
- AC: `DELETE /me` (fresh) → `deletedAt`, revoke сесій, `202`; `deletion/delete-account` hard delete ≤ 24 год (БД, S3, Redis, Sentry user), `DeletedUserTombstone`, AuditLog анонімізується; integration за `09-security-privacy.md` §12.1.

### M5-10 · Retention schedulers · `later-r1l`
- FR: — · Area: worker, db · Est: 2h · Depends: M5-09 · Flow: /feature
- AC: schedulers за `05-data-model.md` §8 (job `cleanup-<model>`, scheduler `<queue>:cleanup-<model>`), ідемпотентні, integration на межі дат.

### M5-11 · Web: Settings → Data · `later-r1l`
- FR: FR-PRIV-01, FR-PRIV-02 · Area: web · Est: 1.5h · Depends: M5-08, M5-09 · Flow: direct
- AC: export (статус, download), `DangerZone` delete account з `ReauthDialog`.

### M5-12 · Demo restrictions + anti-abuse · `later-r1l`
- FR: FR-DEMO-03, FR-DEMO-04, FR-DEMO-05 · Area: api, security · Est: 3h · Depends: M2-12, M4-19, M5-09 · Flow: /feature
- AC: Turnstile server-verify, ≤ 3/добу на IP, ≤ 200 активних; audit `DEMO_CREATED`; знімає production-guard M2-12; `no-demo` guard (uploads, capture, email, auth-зміни, export) → `403 DEMO_FEATURE_DISABLED`; IDOR між двома demo-користувачами; CSP для Turnstile/report-to + nightly header check (решта колишнього M5-14).

### M5-13 · Demo purge + «Request access» · `later-r1l`
- FR: FR-DEMO-02, FR-DEMO-06 · Area: worker, web · Est: 2h · Depends: M5-12 · Flow: /feature
- AC: scheduler `deletion:purge-demo` (pipeline M5-09), прибирає й накопичених demo-користувачів; CTA «Request access» (G-06).

### M5-15 · Metrics instrumentation · `later-r1l`
- FR: — · Area: obs, api, worker · Est: 3h · Depends: M3-01, M4-19 · Flow: /feature
- AC: `prom-client` на 9464/9465/9466; метрики `12-infra-ops.md` §10; labels без userId/raw path.

### M5-16 · Prometheus / Grafana / Alertmanager as code · `later-r1l`
- FR: — · Area: obs, infra · Est: 4h · Depends: M5-15 · Flow: /feature
- AC: Compose-профіль `observability` (тільки `internal`, local — `127.0.0.1`); dashboards + alert rules + `promtool` у CI; receivers з env; скрипт навантаження на seed для скріншота README.

### M5-21b · E2E flows 5, 6 · `later-r1l`
- FR: FR-PRIV-02, FR-DEMO-03 · Area: e2e · Est: 1h · Depends: M5-11, M5-13 · Flow: /e2e
- AC: flow 5 (delete account з re-auth → вхід неможливий), flow 6 (demo → upload вимкнено → вихід).

### M5-23 · k6 + Lighthouse nightly · `later-r1l` · **optional**
- FR: — · Area: ci, obs · Est: 2h · Depends: M3-23, M2-08 · Flow: direct
- AC: `nightly.yml` проти `compose.ci.yml`: k6 (seed 2 000 / 20 000) і Lighthouse з NFR-порогами як орієнтир; падіння → issue.

### M5-24 · Admin TOTP + Bull Board · `later-r1l` · **optional**
- FR: — · Area: api, security · Est: 2h · Depends: M3-09 · Flow: /feature
- AC: TOTP для `ADMIN`; Bull Board за admin-guard, не через Caddy; не-admin → 404; audit `ADMIN_ACCESS`.

### M5-26b · Full privacy policy · `later-r1l`
- FR: — · Area: docs, web · Est: 0.5h · Depends: M5-26, M5-09 · Flow: direct
- AC: таблиця сховищ/retention (`09-security-privacy.md` §12), включно з exports/deletion/email.

---

## Later — when hosting

ADR 022: виконуються лише після рішення хостити (варіант — `12-infra-ops.md` §2.1). ID збережено; GitHub milestone `Later`, label `later`. Не входять у gate M2-11/M5-28 і в підсумок годин R0/R1. Порядок: M0-13 → M0-14b → M0-15b → (M5-18, M5-17, M5-20 — за потреби).

### M0-13 · Hosting provisioning (terraform apply) · `later`
- FR: — · Area: infra · Est: 1.5h · Depends: M0-17 · Flow: direct
- AC:
  - Обрано варіант хостингу (Oracle A1 / Hetzner); R2-bucket для Terraform state, `init` з backend, `terraform.yml` + `plan` у PR, `apply` manual з approval.
  - VPS (Docker, Tailscale, host firewall; 22 закритий публічно, 80/443 тільки з Cloudflare), DNS `app.`/`api.`, Pages project, R2 buckets (documents/exports/backups, scoped tokens без delete), prod Google OAuth client, GitHub Environment `production` + secrets; перевірка presigned PUT на R2 (залишок M0-16). Runbook `infra/README.md`.

### M0-14b · First live deploy + Pages `_headers` check · `later`
- FR: — · Area: ci, infra, security · Est: 1.5h · Depends: M0-13, M0-14 · Flow: /feature
- AC:
  - `deploy-prod.yml`: тригер push `main`, images у GHCR (`sha-*`, pinned digest); перший прогін зелений; health-check smoke.
  - Spike CSP: `_headers` реально віддається Pages на custom domain (curl-check у workflow); інакше — SPA з Caddy static (уже є з M0-14). Prod «hello»: sign-in Google → `/applications`.

### M0-15b · Off-site backups to R2 + uptime + Telegram · `later`
- FR: — · Area: infra, obs · Est: 1h · Depends: M0-14b · Flow: direct
- AC:
  - backup-cron у `compose.prod.yml`: `pg_dump -Fc` → `age` → R2, lifecycle 14 д; результат → Telegram. Зовнішній uptime-check `/health/ready`. Перший ручний restore з R2 (runbook M2-10, розділ «when hosting»).

### M5-17 · WAL-G continuous archiving · `later` · **optional**
- FR: — · Area: infra · Est: 3h · Depends: M0-15b · Flow: /feature
- AC:
  - Роль `backup`: `ALTER ROLE backup REPLICATION` + `pg_hba.conf` обмежує replication-підключення хостом backup (до M5-17 роль `NOREPLICATION`, `infra/postgres/init/10-roles.sql`).
  - WAL-G (libsodium), base backup щодня, `archive_timeout = 60s`, retain 14 днів; textfile-метрики свіжості. Без нього RPO лишається 24 год.

### M5-18 · Restore-test workflow · `later`
- FR: — · Area: ci, infra · Est: 2h · Depends: M0-15b · Flow: /feature
- AC:
  - `restore-test.yml` (monthly + manual, Environment `backup-restore`) за `12-infra-ops.md` §5: ефемерний PG на prod-хості, перевірки, повторне застосування tombstones, метрика + Telegram; перший прогін успішний.

### M5-20 · Staging environment + production release workflow · `later` · **optional**
- FR: — · Area: infra, ci · Est: 3h · Depends: M0-14b, M2-08, M5-16 · Flow: /feature
- AC:
  - Synthetic-only staging: окремий registrable domain, окремі секрети/OAuth client/R2 bucket, GitHub Environment `staging`, дані лише з `pnpm db:seed`; demo з Turnstile (M5-12).
  - Auto-тригер `deploy-prod.yml` замінюється: push `main` → `deploy-staging.yml`; `release.yml` на `v*`: retag digest зі staging → approval (Environment `production`) → backup marker → migrate → rollout з healthcheck → SPA → `@smoke` (M5-21) → Sentry release + sourcemaps → Grafana annotation; nightly header check / k6 / Lighthouse — на staging.

Закрито (not planned): **M5-19 · Terraform IaC** — код і CI validate → M0-17 (R0), remote state + plan/apply → M0-13.

---

## Coverage check

| FR | Tasks | | FR | Tasks |
|---|---|---|---|---|
| FR-AUTH-01 | M0-10, M0-12 | | FR-PROF-01 | M0-11, M0-12, M1-19 |
| FR-AUTH-02 | M0-10, M3-05 | | FR-PROF-02 | M3-18, M5-07 |
| FR-AUTH-03 | M0-07b, M0-09, M0-10, M2-07, M3-24 | | FR-PROF-03 | M4-01, M4-03, M4-05 |
| FR-AUTH-04 | M0-10 | | FR-PROF-04 | M4-02, M4-04, M4-06 |
| FR-AUTH-05 | M3-05, M3-10 | | FR-PROF-05 | M4-03, M4-05 |
| FR-AUTH-06 | M3-06, M3-10 | | FR-DOC-01 | M0-16, M4-14, M4-15, M4-18 |
| FR-AUTH-07 | M3-05, M3-07 | | FR-DOC-02 | M4-14, M4-16, M4-18 |
| FR-AUTH-08 | M3-08 | | FR-DOC-03 | M4-17 |
| FR-AUTH-09 | M3-06, M3-09, M3-10 | | FR-DOC-04 | M4-15 |
| FR-AUTH-10 | M3-09, M3-10, M5-08, M5-09 | | FR-DOC-05 | M4-16 |
| FR-JOB-01 | M1-04, M1-13 | | FR-DOC-06 | M4-16, M4-18 |
| FR-JOB-02 | M1-04, M1-13 | | FR-DISC-01 | M3-02b, M4-08, M4-09, M4-12 |
| FR-JOB-03 | M1-04 | | FR-DISC-02 | M4-07, M4-09 |
| FR-JOB-04 | M1-01, M1-04, M1-13 | | FR-DISC-03 | M4-08, M4-09, M4-12 |
| FR-JOB-05 | M1-04, M1-17 | | FR-DISC-04 | M4-09 |
| FR-JOB-06 | M1-04, M1-17 | | FR-DISC-05 | M4-11, M4-13 |
| FR-JOB-07 | M3-20, M3-21, M3-22, M3-25 | | FR-AI-01 | M4-20, M4-21 |
| FR-JOB-08 | M4-22 | | FR-AI-03 | M4-22 |
| FR-JOB-09 | M3-21 | | FR-AI-05 | M3-22, M4-19, M4-22 |
| FR-JOB-10 | M4-07, M4-10, M4-12 | | FR-AI-06 | M4-19, M4-23 |
| FR-APP-01 | M1-02, M1-06, M1-13 | | FR-AI-07 | M4-19, M4-23 |
| FR-APP-02 | M1-01, M1-06, M1-07, M1-13 | | FR-NOTIF-01 | M3-02b, M3-17, M3-19, M5-06 |
| FR-APP-03 | M1-05, M1-08 | | FR-NOTIF-02 | M3-04, M5-06, M5-07 |
| FR-APP-04 | M1-03, M1-08 | | FR-NOTIF-03 | M5-06 |
| FR-APP-05 | M1-08, M1-14, M3-24 | | FR-NOTIF-04 | M5-06 |
| FR-APP-06 | M1-10, M1-14, M3-24 | | FR-DASH-01 | M1-18 |
| FR-APP-07 | M1-07, M1-10, M1-15 | | FR-DASH-02 | M2-05 |
| FR-APP-08 | M1-16 | | FR-DASH-03 | M5-03, M5-04 |
| FR-APP-09 | M1-09, M1-16 | | FR-DASH-04 | M5-05 |
| FR-APP-10 | M1-09, M1-16 | | FR-ANL-01 | M5-01, M5-02 |
| FR-APP-11 | M1-07, M1-15, M1-17 | | FR-ANL-02 | M5-01 |
| FR-APP-12 | M1-06, M1-17 | | FR-ANL-03 | M5-01 |
| FR-APP-13 | M1-05, M1-10, M1-14 | | FR-ANL-04 | M5-01 |
| FR-APP-14 | M3-11 | | FR-ANL-05 | M5-01, M5-02 |
| FR-APP-15 | M3-12 | | FR-PRIV-01 | M5-08, M5-11 |
| FR-APP-16 | M3-13 | | FR-PRIV-02 | M5-09, M5-11, M5-21 |
| FR-REM-01 | M1-11, M1-17 | | FR-PRIV-03 | M4-23 |
| FR-REM-02 | M1-12, M1-18 | | FR-PRIV-04 | M1-04, M1-06, M1-17 |
| FR-REM-03 | M1-11, M1-18 | | FR-IMP-01 | M2-01, M2-02, M2-04 |
| FR-REM-04 | M3-16 | | FR-IMP-02 | M2-02, M2-04, M3-24 |
| FR-REM-05 | M3-18 | | FR-IMP-03 | M2-01, M2-02 |
| FR-REM-06 | M3-18, M5-06 | | FR-IMP-04 | M2-01, M2-02 |
| FR-REM-07 | M3-16 | | FR-IMP-05 | M2-03, M2-05 |
| FR-INT-01 | M3-14, M3-15 | | FR-IMP-06 | M2-03 |
| FR-INT-02 | M3-14 | | FR-DEMO-01 | M2-08, M2-12 |
| FR-INT-03 | M3-15 | | FR-DEMO-02 | M5-13 |
| FR-INT-04 | M3-15 | | FR-DEMO-03 | M5-12, M5-21 |
| FR-INT-05 | M3-14, M5-03 | | FR-DEMO-04 | M5-12 |
| | | | FR-DEMO-05 | M5-12 |
| | | | FR-DEMO-06 | M2-12, M5-13 |

Не покрито свідомо: немає. Поза R0/R1 (не плануються): FR-PROF-06, FR-DISC-06/07, FR-MATCH-04/06, FR-AI-02/04, FR-NOTIF-05, FR-DASH-05, FR-ANL-06.

ADR 025: FR-MATCH-01/02/05 → M4-24 (частково), FR-MATCH-03 → M4-25; FR-PROF-04 також M4-08. Задачі з таблиці, позначені `later-r1l`, не входять у R1-lite (список — розділ `Later — after R1-lite`). У R1-lite FR-PROF-03/05 покрито частково (M4-03, M4-05).
