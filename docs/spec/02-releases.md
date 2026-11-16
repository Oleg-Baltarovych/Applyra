# Релізи, milestones, backlog, DoD

> Applyra spec v2.1 · Зона: обсяг релізів, єдиний таймлайн, епіки, Definition of Done · Пов'язані: `01-product.md`, `03-functional.md`, `11-testing.md`, `12-infra-ops.md`

## 1. Принципи

- Соло-розробка, **~15–20 год/тиждень**. Оцінки — орієнтир, не зобов'язання.
- Кожен реліз окремо деплоїться і корисний сам по собі (D1, див. `01-product.md` §3).
- Обсяг релізу визначається тегами `R0…R3` у `03-functional.md`; цей файл — зведення і порядок. При розбіжності правильний тег у `03-functional.md`.
- Нове, що не влазить, → `Later`, а не в поточний реліз.
- Єдине джерело строків — таблиця §3. Інші файли посилаються на неї.

## 2. Релізи

### 2.1. R0 — «Tracker for myself» (≈45–55 год, 3–4 тижні)

**Мета:** автор переносить пошук із Google Sheets в Applyra і користується щодня.

| Входить | Вимоги |
|---|---|
| Monorepo, Docker Compose, CI: lint, typecheck, unit + integration (IDOR applications), build | `11-testing.md`, `12-infra-ops.md` |
| Auth: **тільки Google OAuth**, сесії, allowlist реєстрації | FR-AUTH (R0) |
| `UserSettings`: timezone (з браузера), пороги stale, `hotkeysEnabled` | FR-PROF (R0) |
| Ручна форма вакансії; «paste text» зберігається як опис (без fetch і без LLM) | FR-JOB (R0) |
| Applications: CRUD **з delete**, Kanban (DnD + «Move to…»), Table, простий Detail (поля, notes, timeline) | FR-APP (R0) |
| Transitions з idempotency + **Undo toast 10 с** | FR-APP (R0) |
| Бейдж «N днів без активності» (без stale-підказок) | FR-APP (R0) |
| Next action + списки **Today / Overdue / Upcoming** — рахуються при читанні, без worker | FR-REM (R0) |
| CSV-імпорт (preview → commit, мапінг колонок і статусів) | FR-IMP (R0) |
| Синхронний експорт CSV/JSON | FR-IMP (R0) |
| Deploy R0-середовища на майбутній prod-хост (реальні дані автора, allowlist = автор; VPS: api + postgres + redis, **без worker-контейнера**; SPA — Cloudflare Pages) + нічний `pg_dump`. Synthetic staging — з R1 (D-01) | `12-infra-ops.md` §1 |
| Security headers / CSP (API + `_headers` SPA); Sentry для api (web/worker — R1) | `09-security-privacy.md` §9, `11-testing.md` §5, `12-infra-ops.md` §9 |
| Onboarding: «Import CSV / Add first job»; навігація: Applications · Today · Settings | FR-DASH (R0), `10-frontend-ux.md` |

**Не входить у R0 (перенесено в R1):** URL fetcher (SSRF + JSON-LD) · in-app notification centre · email + password і reset · stale-підказки · contacts · interviews · Playwright E2E · outbox + worker · Prometheus/Grafana.

**Exit criteria:** усі поточні відгуки автора в Applyra; 7 днів щоденного використання без повернення до таблиці; нічний бекап відновлюється вручну хоча б раз.

### 2.2. R1 — «Public MVP / Portfolio-ready» (≈125–150 год, ~8 тижнів)

| Блок | Зміст |
|---|---|
| Platform | outbox + BullMQ worker, AuditLog, Prometheus + Grafana (dashboards/alerts as code), Sentry web + worker |
| Auth | email + password + reset + email verification, політика паролів (≥12 + HIBP), revoke сесій, re-auth для чутливих дій |
| Capture | URL fetcher (SSRF-safe) + JSON-LD, `extract-job` (LLM) як fallback з підтвердженням, політика доменів |
| CRM | stale-підказки, custom reminders, редагування/видалення подій, contacts, interviews + `.ics` |
| Profile & Docs | Career Profile, skills (каталог + aliases), CV upload/версії/parsing |
| Jobs | список, пошук (FTS + trigram), фільтри (без зарплатного — R2), save/hide |
| Insights | Dashboard, Analytics (base) |
| Notifications | in-app центр, email-нагадування, daily digest, quiet hours |
| Privacy | повний async експорт (zip), видалення акаунта, AI settings |
| Demo & launch | ефемерний demo, synthetic staging + production release flow (тег `v*` + approval), README зі скріншотами, ADR актуальні (000–021 уже є, нові — за потреби), restore-тест бекапу, Playwright E2E, privacy policy |

**Exit criteria:** незнайомий рекрутер/інженер відкриває посилання, заходить у demo і за 2 хвилини розуміє, що робить продукт; CI зелений; Grafana-дашборд показує живі метрики prod.

### 2.3. R2 — «Discover & Match» (≈60–80 год, ~4 тижні)

- Ingestion: Greenhouse, Lever, Ashby (per-company boards), DOU RSS; source health, auto-disable.
- Нормалізація, salary normalization (USD/міс, курси НБУ) + фільтр/сортування Jobs за min salary USD/міс, дедуплікація (рівні external ID → URL → fingerprint; similarity — відкладено).
- Matching v1 (детермінований): пояснення, confidence, unknowns; match feedback.
- Saved searches + digest нових результатів.
- OpenTelemetry traces API → queue → worker.
- Telegram-бот для нагадувань (Could).

Деталі — `08-ingestion-matching.md`, FR-DISC, FR-MATCH.

### 2.4. R3 — «AI Assistant» (≈45–60 год, ~3 тижні)

- AI tasks: Analyze Vacancy, Tailor CV suggestions, Cover letter / recruiter message, Recruiter reply, Interview prep, Parse CV → profile.
- Решта задач на вже наявній з R1 інфраструктурі (executor, AiRun, `AiUsageDaily`, бюджети, кеш — з `extract-job`).
- Embeddings (pgvector) + семантичний компонент matching.
- Golden-set evals для `analyze-job` (для `extract-job` — уже з R1).

Деталі — `07-ai.md`, FR-AI.

### 2.5. Later (без строків)

Browser extension (MV3) · AI-чат із діями (tool calling + confirm) · Google Calendar sync · Skill Gap Analyzer · Salary analytics · Company notes/intelligence · similarity-dedup + manual review · UA-локалізація · монетизація.

## 3. Єдиний таймлайн (milestones)

Тижні рахуються від старту, при 15–20 год/тиждень. Реліз = останній milestone блоку.

| Milestone | Тижні | Год | Зміст | Реліз |
|---|---|---|---|---|
| M0 Setup | 1 | 12–15 | monorepo, CI, compose, Google OAuth + allowlist, `UserSettings`, deploy «hello» (R0-середовище на prod-хості), нічний `pg_dump`; **spike версій**: NestJS 12 (fallback 11) з `nestjs-zod` і `@thallesp/nestjs-better-auth`, BullMQ 6 ↔ `@nestjs/bullmq` (інакше власна обгортка) — див. `04-architecture.md` §7 | |
| M1 Tracker | 2–3 | 22–26 | applications CRUD + delete, Kanban, Table, Detail, timeline, transitions + idempotency + undo, ручна вакансія, next action, Today/Overdue | |
| M2 Migration | 4 | 11–14 | CSV import (preview → commit), експорт CSV/JSON, IDOR-тести applications, полірування для щоденного використання | **R0** (кінець тижня 4) |
| M3 Capture & Notify | 5–6 | 30–35 | outbox + worker, URL fetcher + JSON-LD, notification centre, stale-підказки, custom reminders, email+password+reset, contacts, interviews, Playwright E2E | |
| M4 Profile, Jobs & Extraction | 7–9 | 45–55 | profile + skills, documents, Jobs search/filters, `extract-job` + golden set → **вибір LLM-провайдера** | |
| M5 Insights & Launch | 10–12 | 50–60 | dashboard, analytics, email + digest, privacy (export/delete), demo, Prometheus/Grafana, security pass, restore-тест, prod, README, ADR | **R1** (кінець тижня 12) |
| M6 Ingestion | 13–14 | 30–40 | adapters, normalization, salary + курси + salary-фільтр Jobs, dedup, source health | |
| M7 Matching | 15–16 | 30–40 | matching v1, feedback, saved searches + digest, OTel | **R2** (кінець тижня 16) |
| M8 AI | 17–19 | 45–60 | решта AI tasks, evals `analyze-job`, embeddings | **R3** (кінець тижня 19) |

Між R0 і M3 допустима пауза на dogfooding (1–2 тижні) — таймлайн зсувається цілком.

## 4. Backlog (епіки → GitHub Issues)

Нумерація issues — `E<NN>-<nn>` (наприклад `E03-04`), щоб не плутати з ID ревʼю (`A-01`, `P-04`). Кожен issue має AC і посилання на `FR-*` або розділ спеки.

| Епік | Зміст | Реліз |
|---|---|---|
| E01 Foundation | monorepo + turbo, tsconfig base, ESLint (+ boundaries) + Prettier, compose, env-валідація, CI, gitleaks, PR template, `.env.example`, README skeleton, ADR index (000–021 уже записані) | R0 |
| E02 Auth | Better Auth + Prisma, Google OAuth, allowlist, guards, `@CurrentUser`, сесії; R1: email+password, reset, HIBP, re-auth, revoke-all | R0 / R1 |
| E03 Applications | схема + partial unique, CRUD + delete, transitions + events + idempotency + undo, Kanban, Table, Detail, notes, бейдж днів; R1: stale-підказки, edit/delete events, contacts | R0 / R1 |
| E04 Jobs & Capture | Job (PRIVATE), ручна форма, paste text; R1: `UserJob` + backfill, safe fetcher (SSRF), JSON-LD mapper, політика доменів, JobDraft UI | R0 / R1 |
| E05 Reminders & Notifications | next action → Reminder, Today/Overdue/Upcoming; R1: worker-доставка `ReminderDelivery`, notification centre, email + шаблони, digest, preferences, quiet hours | R0 / R1 |
| E06 Import / Export | CSV import session (preview → commit), синхронний експорт; R1: async `DataExport` zip | R0 / R1 |
| E07 Profile & Skills | profile CRUD, skills seed (≥300 з aliases), autocomplete, languages, preferences, hard filters | R1 |
| E08 Documents | presigned PUT (підписані `Content-Length`/`Content-Type`), magic bytes, карантин, версії, parse у child process, download URLs, видалення | R1 |
| E09 Jobs search, Dashboard, Analytics | search_vector migration, JobQuery, фільтри (без зарплати), keyset pagination, dashboard, funnel, channels | R1 |
| E10 Platform & Ops | outbox + relay, AuditLog, export/delete pipelines, demo (ефемерний), Sentry, pino redaction, Prometheus/Grafana, CSP/headers, backups + restore-тест | R0 (backups, CSP/headers, Sentry api) / R1 |
| E11 Ingestion | adapter contract, Greenhouse/Lever/Ashby/DOU, normalization, salary parser, курси НБУ, salary-фільтр/сортування Jobs, dedup, source health, admin | R2 |
| E12 Matching | skill extraction, компоненти, агрегація, golden set, тригери, UI, feedback, saved searches, OTel | R2 |
| E13 AI | AIProvider, task registry, executor, AiRun, бюджети (`AiUsageDaily`, `AiGlobalUsageDaily`), `extract-job` (R1), решта задач, evals, embeddings | R1 / R3 |

## 5. Definition of Done

### 5.1. DoD для R0 (полегшений)

Задача готова, коли:
- AC відповідних `FR-*` виконані.
- Валідація на межі (Zod з `packages/contracts`).
- Доступ через `findOwned*`; для кожного приватного endpoint — IDOR-тест (чужий ресурс → 404).
- Unit-тести на domain-логіку (`*.domain.ts`), test-first.
- `pnpm lint && pnpm typecheck && pnpm test` зелені в CI.
- Немає `any` / `@ts-ignore` / `!` без коментаря-обґрунтування.
- Логи без чутливих даних.
- UI: loading і error стани; keyboard-доступ до основних дій.

### 5.2. DoD з R1 (повний)

Усе з §5.1, плюс:
- Empty-стани з CTA; responsive; WCAG 2.2 AA для зачеплених екранів (див. `10-frontend-ux.md`).
- Integration-тести (Testcontainers) для repository/raw SQL і processors, якщо зачеплені.
- Playwright E2E оновлено, якщо зачеплено ключовий flow (див. `11-testing.md`).
- Background jobs / consumers ідемпотентні (стабільний `jobId` / dedup key).
- Чутливі дії пишуться в AuditLog (перелік — див. `09-security-privacy.md`).
- Нові метрики/алерти, якщо з'явився новий процес або черга (див. `12-infra-ops.md`).
- Міграції backward-compatible (expand → migrate → contract), без drift.
- SPEC / ADR оновлено, якщо змінилась поведінка або архітектура.

## Зміни відносно v2.0

- P-01: R0 урізано за SPEC-REVIEW §3, 3–4 тижні (~45–55 год).
- P-02: R0 у релізах і milestones узгоджено (capture і export).
- P-20: одна таблиця строків §3 замість різних у §4/§18/§19.
- P-10: R0 auth — тільки Google OAuth; email+password+reset — R1.
- P-11: URL capture (JSON-LD) — R1 разом із fetcher.
- P-08: contacts/interviews/CV прибрано з R0 Detail.
- P-09: синхронний експорт у R0.
- P-15: R0 onboarding і навігація без профілю.
- P-17 / рішення §4.6: Prometheus/Grafana — R1; OTel — R2.
- P-23: нічний `pg_dump` у R0.
- A-03: outbox + worker — з R1; у R0 немає worker-контейнера, Today/Overdue рахуються при читанні.
- Фільтр Jobs за min salary USD/міс — R2 разом із salary normalization.
- M0: spike сумісності NestJS 12 / BullMQ 6.
- A-23 / рішення §4.9: similarity-dedup — Later.
- S-15 / P-16: ефемерний demo в R1.
- Q4: вибір LLM-провайдера в M4 за golden set.
- DoD розділено на R0 (полегшений) і R1+ (повний); епіки перейменовано `E01…E13`.
