# SPEC v2.0 — ревʼю (2026-11-16)

Три незалежні ревʼю: продукт/scope (P-), архітектура/дані/API/AI (A-), безпека/тести/інфра (S-, T-, I-).
Загальний висновок: **концепція і архітектурний напрям сильні**, але SPEC ще не готовий як «джерело правди для агента»:
R0 перевантажений, модель даних неповна (FK, налаштування користувача, idempotency), а безпека описана на рівні намірів, а не перевірюваних правил.
Нижче — тільки конкретні проблеми з пропозиціями. Після рішень користувача (розділ 4) зміни вносяться в SPEC v2.1 + ADR.

## 1. Блокери (виправити до старту коду)

| ID | § | Проблема | Пропозиція |
|---|---|---|---|
| P-01 | 4, 18 | R0 нереальний за 2–3 тижні при 15–20 год/тиждень (auth ×2, SSRF-fetcher, JSON-LD, Kanban+Table+Detail+Timeline, reminders з TZ, CSV, staging) | Урізати R0 (розділ 3), строк 3–4 тижні |
| P-03 | 5.4, 8.2 | Reminders залежать від timezone/quiet hours, але timezone є тільки в CareerProfile (R1), quiet hours немає ніде | Таблиця `UserSettings` у R0 (timezone з браузера, staleDays); quiet hours → R1 |
| P-06 | 5.3, 10.2 | CSV-імпорт не покриває реальну Google Sheet: довільні статуси, формати дат, дублі при повторному імпорті, події «заднім числом» | `preview` + `commit` (idempotent), мапінг значень статусів, формат дати, ключ (company, role, appliedAt), backdated events |
| A-01 | 8.2 | Немає FK / `onDelete` — hard-delete акаунта не визначений | Таблиця FK: User→owned Cascade; `Application.jobId` SetNull; AuditLog SetNull + анонімізація ip |
| A-02 | 8.1, 7 | Better Auth генерує text id, домен — `@db.Uuid` → FK не зійдуться; UUID v7 ніде не генерується | Better Auth `generateId` = v7-функція; домен `@default(uuid(7))` (Prisma) або PostgreSQL 18 `uuidv7()` |
| A-03 | 6.3, 4 | Outbox у R1, але події R0 (`ApplicationNextActionSet`) його потребують | R0: синхронний upsert reminder у тій самій транзакції; outbox — R1 |
| S-01/02 | 11.4 | SSRF: DNS rebinding (перевірка і з'єднання резолвлять двічі), пропущені `::ffff:`, `0.0.0.0/8`, `100.64/10`, NAT64, decimal/octal IP, імена compose-сервісів | З'єднуватись з уже перевіреним IP (custom `lookup` в undici), `ipaddr.js` allow-only unicast, ізольована egress-мережа, SSRF-тести |
| S-04 | 11.1, 15.3 | `SameSite=Lax` працює тільки same-site; Cloudflare Pages + API на іншому домені ламає cookies/CSRF | ADR: `app.` + `api.` одного домену (або proxy `/api`), `__Host-` cookies, Origin-check Better Auth, CORS allowlist |
| S-08 | 5.7, 11.3 | Парсинг PDF/DOCX — zip bomb, XXE, CVE pdfjs; presigned PUT перевіряється тільки після завантаження | Парсинг у child process з лімітами пам'яті/часу/розміру, `isEvalSupported:false`, presigned POST з `content-length-range`, карантин до валідації |
| S-11 | 11, 13 | Немає CSP і security headers для SPA | Strict CSP, HSTS, nosniff, Referrer-Policy, `frame-ancestors 'none'` + тест у CI |
| S-15, P-16 | 17.2, 12.3 | Один спільний demo-акаунт: відвідувачі бачать/ламають дані один одного, XSS-контент, AI-бюджет, SSRF | Ефемерний demo-користувач на відвідувача (TTL 24 год), у demo вимкнені uploads/URL capture/email, глобальний денний ліміт AI у USD |

## 2. Важливі (виправити в SPEC v2.1)

**Продукт / UX**
- P-02 R0 у §4 і §18 не збігаються (capture/export) · P-20 строки в §4/§18/§19 різні → одна таблиця.
- P-04 «stale» і `lastActivityAt` не визначені → activity = будь-яка подія користувача; stale рахується при читанні; GHOSTED ставить тільки користувач.
- P-05 next action у двох місцях (`nextActionAt` і `Reminder`) → Reminder — джерело, `nextAction*` — кеш; `POST /reminders`.
- P-07 немає DELETE для applications/jobs, редагування подій, undo для drag → додати + «Undo» toast 10 с.
- P-08 R0 Detail показує contacts/interviews/CV, які є тільки в R1 → прибрати з R0.
- P-09 експорт у R0 без endpoint → синхронний `GET /applications/export`.
- P-10 reset пароля в R0 потребує email (R1) → R0 тільки Google OAuth.
- P-11 J1 «15 секунд» без JSON-LD не працює (LinkedIn/Djinni) → перевірити 10 реальних URL на сайт; або `extract-job` у R0, або чесно J1 = R1.
- P-13 формула response rate неоднозначна → визначити «відповідь» і рахувати funnel за досягнутими стадіями.
- P-14 WCAG 2.2: 2.5.7 (альтернатива drag — меню «Move to…»), 2.1.4 (одноклавішні хоткеї можна вимкнути).
- P-15 onboarding R0 тягне профіль R1 → R0 onboarding = «Import CSV / Add first job»; навігація R0 = Applications · Today · Settings.
- P-17 сильні сторони резюме (Prometheus/Grafana) не видно → метрики в R1 (див. I-обс.).
- P-18 capture з Djinni/LinkedIn — політика по доменах: LinkedIn тільки paste, решта — за robots/ToS.

**Дані / архітектура**
- A-04 outbox relay: транзакція тримається під час publish, немає max attempts/`nextAttemptAt`/`lastError`, retention, partial index, fan-out → claim → commit → publish; `jobId = eventId:consumer`; cleanup 7 днів.
- A-05 reminder `deliveryKey` ламається при snooze → `ReminderDelivery(reminderId, dueAt, channel)` unique + `Reminder.source`.
- A-06 бракує моделей: `UserSettings`, `DataExport`, `ImportSession`, `IdempotencyRecord`, `AiUsageDaily`, `user.role`, `user.deletedAt`.
- A-07 `idempotencyKey` глобально unique → `(userId, key)` + збережена відповідь.
- A-08/P-12 немає `Job.canonicalUrl` для дедупу capture → поле + partial unique.
- A-09 приватні jobs через `ownerId`, а не `userId` → окремий helper доступу + IDOR-тест.
- A-10 FTS/trigram/partial index → Prisma бачить drift → `Unsupported("tsvector")`, `ops: raw("gin_trgm_ops")`, preview `partialIndexes` (Prisma 7.4+), `migrate diff --exit-code` у CI.
- A-11 nullable `externalId` у unique → NOT NULL (hash URL); стан «зник 2 рази» → `missedRuns`.
- A-12 багато enum-ів збережені як `String` → Prisma enums + contracts.
- A-13 бюджет AI check-then-call → атомарне резервування (Redis INCRBY).
- A-14 кеш AI без `userId`/model → ризик витоку між користувачами.
- A-15 «AI вимкнено» перевіряється по route, а extract-job всередині capture → перевірка в executor.
- A-17 бракує endpoints (DELETE, bulk, reminders, interviews range, revoke-all…), `/interviews/:id.ics` → `/ics`; окремий route на кожну AI-задачу.
- A-18 cursor pagination для сортувань за salary/relevance не визначена → keyset `(sortValue, id)`.
- A-23 19 модулів — забагато для соло → злити companies/search/dedup у jobs/ingestion; OTel і similarity-dedup відкласти.

**Безпека / тести / інфра**
- S-03 redirect: заборона https→http, порт на кожному кроці, ліміт 2 MB після розпакування.
- S-05 сесії: idle/absolute TTL, rotation, re-auth ≤10 хв для delete/export, revoke на зміні пароля.
- S-06 account enumeration, політика паролів (≥12 + HIBP), allowlist реєстрації в R0.
- S-07 Google account linking → тільки при `email_verified` обох сторін.
- S-09 sanitizer не названий → `sanitize-html` з allowlist.
- S-10 CSV formula injection при експорті; ліміти імпорту (1 MB / 5k рядків).
- S-12/13 видалення не покриває backups, Sentry, логи, AiRun, Redis, export zip; контакти рекрутерів — персональні дані третіх осіб → таблиця сховищ з retention.
- S-14 AuditLog: перелік подій, 90 днів, append-only.
- S-16/17 supply chain: Renovate, `pnpm audit`/OSV, CodeQL, gitleaks, pinned actions SHA; секрети через GitHub Environments + OIDC.
- S-19 admin/Bull Board без моделі ролі і MFA → `role` + доступ через tunnel.
- T-01 Testcontainers: один набір контейнерів на прогін + template DB на воркер.
- T-02 IDOR suite через «чекліст» не працює → генерувати з таблиці routes; CI падає на непокритий route.
- T-03 бракує: migration tests, contract tests, SSRF/upload negative fixtures, header tests, k6 nightly.
- T-04 «Playwright на preview» конфліктує зі staging тільки з main → PR: Playwright проти compose; після merge — smoke на staging.
- I-01 AWS ≈ $60–100/міс vs VPS ≈ $8 → VPS + Terraform.
- I-02 backups без RPO/RTO і автоматичного restore-тесту → WAL-G/pgBackRest у R2-сховище, щомісячний restore у CI.
- I-03 expand/contract нічим не забезпечений → squawk (лінтер міграцій) у CI, `lock_timeout`.
- R-01 правила §22 частково неперевірювані → перетворити на ESLint/CI-перевірки.

**Дрібні:** P-19, P-21, P-22, P-23 (бекапи вже в R0, бо там твої реальні дані), A-16, A-19 (каталог error codes), A-20, A-21, A-22, S-18, S-20, I-04, AI-01 (AI-вивід без remote images).

## 3. Рекомендований R0 (~45–55 год)
**Залишити:** Google OAuth · Applications CRUD (з delete) + Kanban + Table + простий Detail (поля, нотатки, timeline) · transitions з idempotency + undo · ручна форма вакансії з «paste text» як опис · next action + Today/Overdue (рахується при читанні, без worker) · CSV-імпорт з мапінгом · синхронний експорт CSV/JSON · CI (lint, typecheck, unit), compose, staging + нічний `pg_dump` · IDOR-тести applications.
**Перенести в R0.5/R1:** URL fetcher (SSRF + JSON-LD) · in-app notification centre · email+пароль і reset · stale-підказки (у R0 — бейдж «днів без активності») · contacts · Playwright e2e.

## 4. Рішення (прийняті 2026-11-16)
1. **R0 урізаний** за розділом 3 (≈45–55 год, 3–4 тижні).
2. **Outbox:** у R0 побічні ефекти (reminder upsert) синхронно в тій самій транзакції; transactional outbox + BullMQ — з R1.
3. **Хостинг (Q3):** VPS (Hetzner) + Docker Compose + Caddy + Terraform (VPS, DNS, R2). Без AWS.
4. **Домени:** `app.<domain>` (SPA) + `api.<domain>` (API) — same-site; `__Host-` cookies, `SameSite=Lax`, CORS allowlist.
5. **PostgreSQL 18** з нативним `uuidv7()`; Better Auth `generateId` теж видає UUID v7.
6. **Prometheus + Grafana** (dashboards/alerts as code) — у R1; Sentry для помилок; OpenTelemetry traces — R2.
7. **Demo:** ефемерний користувач на кожного відвідувача (TTL 24 год), без uploads/URL capture/email, AI — заглушка або жорсткий ліміт.
8. **Мова (Q2):** специфікація українською; `docs/spec/00-overview.md` — англійською (summary для публічного репо); код/README/ADR — англійською.
9. **Модулі:** companies → jobs; search → jobs; dedup → ingestion. OTel і similarity-dedup відкладені.
10. **Структура:** SPEC розбито на `docs/spec/*.md` (v2.1); `docs/SPEC.md` v2.0 лишається в git-історії.

## 5. Перевірка стеку (станом на 2026-11)
- Better Auth + NestJS: тільки community-пакет `@thallesp/nestjs-better-auth` (глобальний guard, вимкнути body parser Nest) — назвати в §7.
- Prisma 7 (GA): обов'язкові `prisma.config.ts`, driver adapter `@prisma/adapter-pg`, явний `output` генератора, `.env` не вантажиться автоматично; для Nest CJS — CJS-формат клієнта. Partial indexes — preview з 7.4. Prisma 8 — RC, не брати до GA.
- pgvector у Prisma 7 — досі `Unsupported("vector")` + `$queryRaw`.
- nestjs-zod v5 підтримує Zod 4, є `@ZodResponse`.
- Зафіксувати версії в §7: Node LTS, PostgreSQL, Prisma 7.x, React Router 7 (data/declarative mode), Tailwind v4, BullMQ (job schedulers замість repeatable jobs).
