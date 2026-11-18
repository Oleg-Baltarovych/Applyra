# Тестування

> Applyra spec v2.1 · Зона: стратегія тестів, тестова інфраструктура, security-тести, CI gates · Пов'язані: `02-releases.md`, `06-api.md`, `07-ai.md`, `09-security-privacy.md`, `10-frontend-ux.md`, `12-infra-ops.md`

## 1. Піраміда по релізах

| Рівень | R0 | R1 | R2 | R3 |
|---|---|---|---|---|
| Unit (domain) | так | так | так | так |
| Integration (API + БД) | applications, imports/export, auth (Google, mocked), reminders upsert | + documents, capture, email, privacy (export/delete), demo, outbox relay, BullMQ processors, AI executor + budgets (`extract-job`) | + ingestion, matching | + решта AI-задач |
| IDOR suite (генерований) | так (applications, reminders, imports) | усі приватні routes | так | так |
| Contract (responses ↔ contracts) | так | + OpenAPI ↔ route table | + source adapters на фікстурах | + AI tasks з mocked `AIProvider` |
| Frontend (Testing Library + MSW) | Kanban hooks, optimistic rollback, import mapping, hotkeys | + jobs, filters, dashboard | — | — |
| Security negative fixtures | headers, CSV formula injection | + SSRF, upload | — | prompt-injection fixtures |
| Migration tests | так | так | так | так |
| E2E (Playwright) | — (ручний smoke-чекліст) | PR проти compose + post-merge `@smoke` проти `compose.ci.yml`; live smoke — when hosting (ADR 022) | + ingestion flow | + AI flow (stub) |
| Performance (k6, Lighthouse) | — | nightly проти `compose.ci.yml` (optional, орієнтир) | так | так |
| AI evals | — | `extract-job` (manual/nightly) | — | golden sets (див. `07-ai.md`) |

R0 свідомо легший (P-01): unit + integration + IDOR для applications; e2e — з R1.

## 2. Рівні та інструменти

| Рівень | Що | Інструменти |
|---|---|---|
| Unit | salary parser, normalizers, dedup fingerprint, matching components, status transitions, stale/activity rules, reminder scheduling (timezone, DST, quiet hours), CSV value mapping, formula escaping, redaction list, skill extraction, Zod-схеми | Vitest, fake timers |
| Integration | repositories + raw SQL (FTS, partial unique), transitions + idempotency, outbox relay, BullMQ processors, auth, uploads, IDOR suite | Vitest + Testcontainers (Postgres 18, Redis, MinIO) + Supertest |
| Contract | відповіді API ↔ схеми `@applyra/contracts`; OpenAPI ↔ route table; source adapters; AI-задачі | Vitest + фікстури |
| Frontend | компоненти з логікою, хуки, a11y (`axe-core` напряму + helper `expectNoAxeViolations`, `apps/web/test/support/axe.ts`; `vitest-axe` 0.1.0 не підтримується; `color-contrast` вимкнено в jsdom — контраст токенів перевіряє `test/contrast.test.ts`) | Vitest + Testing Library + MSW |
| E2E | критичні flows (§6) | Playwright + `@axe-core/playwright` |
| Performance | NFR (див. `12-infra-ops.md` §12) | k6, Lighthouse CI |

## 3. Інфраструктура integration-тестів (T-01)

| Елемент | Правило |
|---|---|
| Контейнери | **один набір на прогін**: Vitest `globalSetup` стартує Postgres 18 і Valkey 9 (Testcontainers; ті самі образи, що в local compose — drift-тест `apps/api/test/images.test.ts`), передає хост/порти й згенеровані на прогін паролі через `provide()`; `teardown` зупиняє, Ryuk прибирає при обриві. MinIO додається з M4-14 (перший storage-тест; Chainguard digest з compose) |
| Template DB | у `globalSetup`, один раз: `infra/postgres/init/10-roles.sql` (паролі через env `exec`) → `prisma migrate deploy` як `applyra_maintenance` + REVOKE на `_prisma_migrations` (з M0-08) → `IS_TEMPLATE true, ALLOW_CONNECTIONS false` |
| DB на worker | кожен Vitest worker (`VITEST_POOL_ID`): `CREATE DATABASE test_w<id> TEMPLATE applyra_template OWNER applyra_maintenance` під advisory lock; між test-файлами — drop + re-clone (~100 ms) → ізоляція per file. ACL бази (`REVOKE … FROM PUBLIC`, `GRANT CONNECT`) TEMPLATE не копіює — накладається заново, smoke-тест порівнює `datacl` клону і template |
| Redis | окремий BullMQ `prefix` і key prefix на worker (`t<id>:`); `FLUSHDB`-подібне очищення по prefix між файлами |
| MinIO | bucket на worker (`test-w<id>`) |
| Час | fake timers / інжектований `Clock`; seeded faker |
| Дані | factories/builders (`test/factories/*`), без спільних глобальних fixtures |
| Prisma | ніколи не мокається в integration; Prisma Extension «запит без `userId`» → fail у тестах (див. `09-security-privacy.md` §2) |
| Локально | `pnpm test:integration` — ефемерні контейнери на кожен прогін (паролі генеруються на прогін; reuse потребував би стабільного пароля в env контейнера). Reuse — opt-in пізніше, лише якщо cold start > 15 с (M0-07a) |

## 4. IDOR suite, генерований з route table (T-02)

**Мета:** неможливо додати приватний endpoint без IDOR-перевірки.

1. Тестовий bootstrap піднімає Nest app і через `DiscoveryService` + `MetadataScanner` + `Reflector` будує route table: `{ method, path, isPublic, isOptional, roles, idorExempt, controller, handler }` (`apps/api/test/support/route-table.ts`, M0-07b).
2. `test/idor/fixtures.ts` — мапа `"<METHOD> <path>" → fixture`, де fixture створює ресурс для user A і повертає `{ params, query?, body? }`.
3. Генерований тест для кожного не-`@Public` route, запит від user B:

| Тип route | Очікування |
|---|---|
| з `:id` (read/update/delete/дії) | **404** `NOT_FOUND`, стан ресурсу A не змінився (перевірка в БД) |
| list / search / export | 200, жоден id ресурсів A не присутній у відповіді |
| create з посиланням на чужий ресурс (напр. `jobId` A) | 404 |
| приватна `Job` A (A-09) | 404 для B; `PUBLIC` job — 200 |
| `@Roles('ADMIN')` | 404 для USER (у т.ч. demo-користувача) |

4. **Coverage gate:** `routes(non-@Public) − fixtures − @IdorExempt` ≠ ∅ → тест падає зі списком непокритих routes. Fixture для неіснуючого route → теж fail.
5. `@IdorExempt('reason')` — тільки для routes без чужих ресурсів (`GET /me`, `POST /auth/*`); причина обов'язкова, список exempt виводиться у звіті.
6. Той самий route table перевіряє: кожен не-`@Public` route має auth guard; GET-handlers не позначені як мутації (OWASP API5, див. `09-security-privacy.md` §15).

## 5. Security, contract і migration tests (T-03)

### 5.1. SSRF negative fixtures [R1]

Fetcher тестується з інжектованим DNS resolver і локальним HTTP-сервером (тестова policy дозволяє тільки один конкретний loopback-порт для позитивних кейсів).

| Кейс | Очікування |
|---|---|
| `http://127.0.0.1`, `http://127.1`, `http://2130706433`, `http://0177.0.0.1`, `http://0x7f.0.0.1` | `blocked_ssrf` |
| `http://[::1]`, `http://[::ffff:127.0.0.1]`, `http://[::ffff:7f00:1]` | `blocked_ssrf` |
| `http://169.254.169.254/latest/meta-data`, `http://[64:ff9b::a9fe:a9fe]` (NAT64) | `blocked_ssrf` |
| `http://0.0.0.0`, `http://100.64.0.1`, `http://10.0.0.1`, `http://[fd00::1]`, `http://[fe80::1]` | `blocked_ssrf` |
| `http://postgres:5432`, `http://redis`, `http://minio:9000` | `blocked_ssrf` (не резолвиться / заблоковано) |
| DNS rebinding: resolver повертає public, потім private | з'єднання йде на перший перевірений IP (assert на socket remote address) |
| Ім'я з A public + AAAA private | `blocked_ssrf` |
| Redirect → private IP; 4 redirect; `https → http`; redirect на порт 8080 | reject на відповідному кроці |
| `http://host:8080`, `ftp://`, `file://`, `user:pass@host` | reject до DNS |
| gzip bomb (> 2 MB decoded, < 2 MB encoded); `Content-Length: 10MB` | `too_large`, abort |
| `application/json`, `image/svg+xml` | `bad_content_type` |
| slow body (slowloris) | `timeout` ≤ 5 с |

### 5.2. Upload negative fixtures [R1]

`test/fixtures/uploads/`: PDF із JS-action, зашифрований PDF, PDF > 50 сторінок, DOCX zip bomb (ratio > 100, > 50 MB decoded), DOCX > 1 000 entries, DOCX з XXE (`<!DOCTYPE … SYSTEM "file:///etc/passwd">`), `.docm` з макросом, polyglot (PDF magic + HTML), EXE з розширенням `.pdf`, файл > 5 MB, порожній файл. Кожен → `REJECTED` + об'єкт видалено з quarantine; parser process убитий за timeout/memory, worker живий.

### 5.3. Інші security-тести

| Тест | Реліз |
|---|---|
| Security headers API (точні значення з `09-security-privacy.md` §9.2) — Supertest | R0 |
| Security headers SPA (snapshot `_headers` для Cloudflare Pages; у compose — Caddy з тими самими значеннями) — HTTP-запит у CI проти `compose.prod.yml`/`compose.ci.yml`; nightly на hosted — when hosting | R0 (compose), when hosting (live) |
| CORS: чужий Origin → без `Access-Control-Allow-Origin`; мутація без/з чужим `Origin` → 403 `CSRF_ORIGIN`; non-JSON мутація → 415 | R0 |
| Cookies: `__Host-` префікс, `HttpOnly; Secure; SameSite=Lax` | R0 |
| Сесії: absolute TTL, revoke на зміні пароля, `FRESH_SESSION_REQUIRED` після 10 хв | R0/R1 |
| Enumeration: однакові відповіді й код для існуючого/неіснуючого email | R1 |
| CSV formula injection (`=`, `+`, `-`, `@`, tab, CR, fullwidth) | R0 |
| Sanitizer allowlist (XSS-вектори: `<img onerror>`, `javascript:`, `<svg>`, `style`) | R1 |
| Redaction: лог-запис з усіма полями списку → жодного значення в output | R0 |
| Rate limits: auth, capture, import, demo creation → 429 | R0/R1 |
| Demo: заборонені дії → 403; TTL-видалення | R1 |
| Account deletion: після pipeline — жодних рядків/об'єктів/Redis-ключів користувача (перевірка по таблиці сховищ `09-security-privacy.md` §12) | R1 |

### 5.4. Contract tests

- Integration-хелпер `expectContract(res, Schema)` — кожна успішна відповідь у integration-тестах валідується `strict`-схемою з contracts (зайве поле = fail).
- Помилки — формат і `code` з каталогу (`06-api.md`).
- [R1] Згенерований OpenAPI ↔ route table: кожен route задокументований, немає «примарних» шляхів; `oasdiff breaking` проти `main` — breaking change без bump версії API → fail.
- [R2] Source adapters: записані фікстури відповідей Greenhouse/Lever/Ashby/DOU → нормалізований результат (див. `08-ingestion-matching.md`).
- [R3] AI-задачі: mocked `AIProvider`, невалідний вивід → repair → `AI_INVALID_OUTPUT` (див. `07-ai.md`).

### 5.5. Migration tests

| Перевірка | Як |
|---|---|
| Drift | `prisma migrate diff --from-migrations --to-schema --exit-code` |
| Чисте застосування | `migrate deploy` на порожній Postgres 18 |
| Лінтер | squawk на нових SQL-файлах (правила — `12-infra-ops.md` §6) |
| Expand/contract | для міграцій з backfill: seed на N-1 → migrate → assert даних; integration-тести попередньої версії API проходять на новій схемі (тег `@compat`, запускається для PR із міграціями) |

## 6. E2E (T-04) [R1+]

| Контекст | Що | Де |
|---|---|---|
| PR | повний набір критичних flows | `docker compose -f compose.ci.yml up` у CI: production images, Caddy з реальними headers, Mailpit, stub LLM, stub capture-сайт |
| Post-merge (`main`) | `@smoke`: health, demo sign-in (synthetic), відкрити Applications, створити й видалити заявку, headers | `compose.ci.yml` у CI; when hosting — також hosted-середовище після deploy (`12-infra-ops.md` §8) |
| Release (`v*`) — when hosting | `@smoke` проти production з окремим synthetic-акаунтом, що видаляє свої дані | production |

**Критичні flows:**
1. Sign up (email+password) → onboarding → add job (paste) → create application → drag до INTERVIEW → Undo → «Move to…» до INTERVIEW (keyboard) → next action → з'являється в Today → export CSV.
2. Capture URL зі stub-сайту (JSON-LD) → preview → save.
3. CSV import (mapping статусів, дати) → повторний import не створює дублів.
4. User B не бачить даних user A (UI + прямі URL → 404).
5. Delete account (re-auth) → вхід неможливий, дані зникли.
6. Try demo → обмеження (upload вимкнено) → вихід.

Правила: role-based locators; без `waitForTimeout`; viewport desktop + 375px для flows 1 і 4; axe-перевірка на кожному екрані flow 1; trace on first retry; 1 retry тільки в CI. Google OAuth в e2e не проходиться (integration з mocked token endpoint).

## 7. Performance

| Інструмент | Сценарій | Коли |
|---|---|---|
| k6 | read API (`GET /applications`, detail, Today), search (`GET /jobs?q=`), transitions; дані — synthetic seed (2 000 applications, 20 000 jobs) | nightly проти `compose.ci.yml` у CI [R1, optional]; when hosting — staging |
| Lighthouse CI | Dashboard, Applications (LCP, CLS, TBT), mobile + desktop | nightly проти `compose.ci.yml` у CI [R1, optional]; when hosting — staging |

Thresholds = NFR з `12-infra-ops.md` §12; на CI-runner — орієнтир (не prod-подібне залізо), порушення → червоний nightly + issue. Staging (when hosting) містить тільки synthetic data.

## 8. Coverage policy

- Coverage — не ціль. Обов'язковий поріг тільки для `**/*.domain.ts`: **≥ 90% lines і branches** (Vitest `thresholds` per glob) — CI gate з R0.
- Інший код — без порогу; звіт coverage у PR як інформація.
- Тест має падати, коли поведінка ламається; тест, що проходить на порожній реалізації, видаляється.
- Mutation testing (Stryker) для domain — R2 Could.

## 9. CI gates по релізах

| Gate | Тригер | R0 | R1 | R2+ |
|---|---|---|---|---|
| lint (ESLint + boundaries), Prettier check, typecheck | PR | ✓ | ✓ | ✓ |
| unit + domain coverage ≥ 90% | PR | ✓ | ✓ | ✓ |
| integration (Testcontainers) | PR | ✓ | ✓ | ✓ |
| IDOR suite + coverage gate (§4) | PR | ✓ | ✓ | ✓ |
| contract tests (responses) | PR | ✓ | ✓ | ✓ |
| OpenAPI ↔ routes, `oasdiff breaking` | PR | — | ✓ | ✓ |
| migrations: immutability guard, drift, squawk (нові `migration.sql`), clean apply + REVOKE | PR (кожен, без path filter: required check за path filter не звітує й блокує PR; M0-08) | ✓ | ✓ | ✓ |
| security headers, CORS, cookies | PR | ✓ | ✓ | ✓ |
| SSRF / upload fixtures | PR | — | ✓ | ✓ |
| frontend tests + contrast check | PR | ✓ | ✓ | ✓ |
| build (images, multi-arch amd64 + arm64) | PR | ✓ | ✓ | ✓ |
| deploy-ready: `docker compose config` (`compose.yml`, `compose.prod.yml`), `terraform fmt -check` + `validate`, actionlint (ADR 022) | PR | ✓ | ✓ | ✓ |
| supply chain: `pnpm audit`, osv-scanner, gitleaks, SAST Semgrep CE (CodeQL — коли репо публічне, ADR 023) | PR + weekly | ✓ | ✓ | ✓ |
| Playwright e2e проти compose | PR | — | ✓ | ✓ |
| `@smoke` проти `compose.ci.yml` | push `main` | — | ✓ | ✓ |
| smoke на hosted staging/production | push `main` / tag `v*` | when hosting | when hosting | when hosting |
| k6 + Lighthouse (проти `compose.ci.yml`) | nightly | — | optional | ✓ |
| restore test (`12-infra-ops.md` §5) | R0/R1: ручний local restore; monthly — when hosting | ручний (local) | ручний (local) | when hosting |
| AI evals | manual / nightly | — | `extract-job` | golden sets |

Обов'язкові checks налаштовані як branch protection на `main`; nightly/monthly не блокують merge, але відкривають issue при падінні.

## 10. Flaky-тести

- Flaky тест маркується `@quarantine` з issue і датою; виправити ≤ 7 днів або видалити.
- Retries — тільки Playwright у CI (1); Vitest без retries.
- Причини, що виключаються конвенцією: реальний час (fake timers), випадковість (seed), порядок (ізоляція per file), фіксовані sleeps.

## Зміни відносно v2.0

- T-01 — один набір Testcontainers на прогін через `globalSetup`, template DB, БД/Redis prefix/bucket на worker.
- T-02 — IDOR suite генерується з route table (Nest `DiscoveryService`); CI падає на непокритий не-`@Public` route.
- T-03 — додано migration tests, contract tests (responses ↔ contracts, OpenAPI ↔ routes), SSRF/upload negative fixtures, header tests, k6 + Lighthouse nightly на staging.
- T-04 — Playwright на PR проти compose; після merge — smoke на staging; на тег — smoke у production.
- P-01 — піраміда по релізах: R0 легший (unit + integration + IDOR для applications), e2e з R1.
- A-09 — IDOR-перевірка приватних jobs у генерованому suite.
- Нове — таблиця CI gates по релізах, coverage policy з порогом тільки для domain, політика flaky-тестів.
- ADR 022 — без hosted-середовищ: smoke/k6/Lighthouse проти `compose.ci.yml`, live smoke і monthly restore test — when hosting; новий gate deploy-ready (compose config, terraform validate, actionlint, multi-arch build).
