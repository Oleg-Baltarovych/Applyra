# Релізи, milestones, backlog, DoD

> Applyra spec v2.1 · Зона: обсяг релізів, єдиний таймлайн, епіки, Definition of Done · Пов'язані: `01-product.md`, `03-functional.md`, `11-testing.md`, `12-infra-ops.md`

## 1. Принципи

- Соло-розробка, **~15–20 год/тиждень**. Оцінки — орієнтир, не зобов'язання.
- Кожен реліз окремо придатний до деплою (**deploy-ready**, ADR 022) і корисний сам по собі (D1, див. `01-product.md` §3). Постійно розгорнутого середовища в R0/R1 немає; хостинг — `Later — when hosting`.
- Обсяг релізу визначається тегами `R0…R3` у `03-functional.md`; цей файл — зведення і порядок. При розбіжності правильний тег у `03-functional.md`. **Виняток — ADR 025:** R1 звужено до R1-lite (§2.2). R1-тег поза списком §2.2 означає `Later — after R1-lite` (§2.5). Тут перелічені також FR-MATCH, частково підтягнуті з R2.
- Нове, що не влазить, → `Later`, а не в поточний реліз.
- Єдине джерело строків — таблиця §3. Інші файли посилаються на неї.

## 2. Релізи

### 2.1. R0 — «Tracker for myself» (≈45–55 год, 3–4 тижні)

**Мета:** автор переносить пошук із Google Sheets в Applyra і користується щодня.

| Входить | Вимоги |
|---|---|
| Monorepo, Docker Compose, CI: lint, typecheck, unit + integration (IDOR applications), build | `11-testing.md`, `12-infra-ops.md` |
| Auth: **тільки Google OAuth** (опційний у local), сесії, allowlist реєстрації; **demo sign-in без Google** (local/Codespaces, `DEMO_ENABLED`) з синтетичним seed | FR-AUTH (R0), FR-DEMO-01 (R0), ADR 022 |
| `UserSettings`: timezone (з браузера), пороги stale, `hotkeysEnabled` | FR-PROF (R0) |
| Ручна форма вакансії; «paste text» зберігається як опис (без fetch і без LLM) | FR-JOB (R0) |
| Applications: CRUD **з delete**, Kanban (DnD + «Move to…»), Table, простий Detail (поля, notes, timeline) | FR-APP (R0) |
| Transitions з idempotency + **Undo toast 10 с** | FR-APP (R0) |
| Бейдж «N днів без активності» (без stale-підказок) | FR-APP (R0) |
| Next action + списки **Today / Overdue / Upcoming** — рахуються при читанні, без worker | FR-REM (R0) |
| CSV-імпорт (preview → commit, мапінг колонок і статусів) | FR-IMP (R0) |
| Синхронний експорт CSV/JSON | FR-IMP (R0) |
| **Deploy-ready, не hosted** (ADR 022): production image api (multi-stage, non-root, multi-arch) + caddy, `compose.prod.yml` (api + postgres + redis, **без worker-контейнера**), Terraform (Hetzner + Cloudflare), `deploy-prod.yml` (dispatch-only) — усе перевіряється в CI, не застосовується. Автор використовує R0 локально; локальний `pg_dump`-скрипт + ручний restore | `12-infra-ops.md` §1, §5, §8 |
| Local one-command start + `pnpm db:seed` (реалістична синтетика), devcontainer / «Open in GitHub Codespaces», portfolio README (скріншоти/GIF/відео, діаграма, badges) | ADR 022, `01-product.md` §5.1 |
| Security headers / CSP (API + `_headers` SPA, у compose — Caddy з тими самими значеннями); Sentry SDK для api за DSN (web/worker — R1) | `09-security-privacy.md` §9, `11-testing.md` §5, `12-infra-ops.md` §9 |
| Onboarding: «Import CSV / Add first job»; навігація: Applications · Today · Settings | FR-DASH (R0), `10-frontend-ux.md` |

**Не входить у R0 (перенесено в R1):** URL fetcher (SSRF + JSON-LD) · in-app notification centre · email + password і reset · stale-підказки · contacts · interviews · Playwright E2E · outbox + worker · Prometheus/Grafana. За ADR 025 у R1-lite лишились fetcher, worker (без outbox) і Playwright E2E; решта — §2.5 «After R1-lite».

**Exit criteria:** усі поточні відгуки автора в Applyra (local); 7 днів щоденного використання без повернення до таблиці; локальний бекап відновлено вручну хоча б раз; свіжий clone → `docker compose up -d && pnpm dev` → demo sign-in працює без Google credentials; deploy-ready checks у CI зелені.

### 2.2. R1-lite — «Portfolio-ready» (≈68 год, ~4–5 тижнів; ADR 025)

Замінює повний R1 (≈190 год за `mvp-tasks.md`). Задачі — `docs/plans/mvp-tasks.md` M3–M5 (без розділу `Later`).

| Блок | Зміст | Вимоги |
|---|---|---|
| Platform | BullMQ worker (`worker.ts`, потрібен для capture за ADR 021), AuditLog; **без outbox** (skill extraction синхронно в транзакції job); Sentry web + worker за DSN — optional | ADR 001, 021, 025 |
| Capture | URL fetcher (SSRF-safe, окремий контейнер) + JSON-LD, політика доменів; опис зберігається як plain text (`descriptionHtml` = null) | FR-JOB-07, FR-JOB-09 |
| AI | executor, бюджети, AiRun, `extract-job` + golden set, **один провайдер** (ADR 017 follow-up), LLM fallback у capture з підтвердженням і «Context used», AI settings + usage; demo → `StubProvider` | FR-JOB-08, FR-AI-01/03/05/06/07, FR-PRIV-03 |
| Profile & skills (мінімум) | каталог skills + aliases, `UserSkill`; профіль лише seniority, target roles, work modes, employment types (без experience/education/languages/salary/hard filters) | FR-PROF-04; частково FR-PROF-03, FR-PROF-05 |
| Matching-lite | детермінований score + confidence + пояснення (strengths/gaps/unknowns), рахується при читанні (без `MatchScore`). Компоненти Skills/Seniority/Work mode/Employment type (08 §8.1), `algorithmVersion = v1.0-lite`, golden set ≥ 20 пар. Бейдж + «Why?» у detail заявки | частково FR-MATCH-01 (без exclusion), FR-MATCH-02, FR-MATCH-03, FR-MATCH-05 |
| Launch | Playwright E2E (flows 1–4 через demo sign-in) + `@smoke`, OpenAPI ↔ route table + `oasdiff`, a11y/responsive pass, `/bot` + сторінка потоків даних (LLM, AI settings, бекапи), README refresh, ADR актуальні | `11-testing.md`, `09-security-privacy.md` (API9) |

Auth лишається Google OAuth + demo sign-in (local/Codespaces, production-guard M2-12). Обмеження demo (Turnstile, caps, `no-demo`, purge) повертаються з хостингом. Staging, release flow, restore-тест — `Later — when hosting` (ADR 022).

**Exit criteria:** незнайомий рекрутер/інженер відкриває репозиторій (README з відео/скріншотами) або Codespaces, заходить у demo, за 2 хвилини робить capture URL → бачить чернетку (JSON-LD/LLM) → match з поясненням; CI зелений (включно з deploy-ready checks, SSRF fixtures, E2E).

### 2.3. R2 — «Discover & Match» (≈60–80 год, ~4 тижні)

- Ingestion: Greenhouse, Lever, Ashby (per-company boards), DOU RSS; source health, auto-disable.
- Нормалізація, salary normalization (USD/міс, курси НБУ) + фільтр/сортування Jobs за min salary USD/міс, дедуплікація (рівні external ID → URL → fingerprint; similarity — відкладено).
- Matching v1 (детермінований): пояснення, confidence, unknowns; match feedback.
- Saved searches + digest нових результатів.
- OpenTelemetry traces API → queue → worker.
- Telegram-бот для нагадувань (Could).

Деталі — `08-ingestion-matching.md`, FR-DISC, FR-MATCH. ADR 025: matching v1 розширює matching-lite з R1-lite (persist `MatchScore`, тригери, salary/language/hard filters, feedback). R2 спершу забирає з «After R1-lite» потрібні передумови: outbox, Jobs list/search, `UserJob`, повний профіль.

### 2.4. R3 — «AI Assistant» (≈45–60 год, ~3 тижні)

- AI tasks: Analyze Vacancy, Tailor CV suggestions, Cover letter / recruiter message, Recruiter reply, Interview prep, Parse CV → profile.
- Решта задач на вже наявній з R1 інфраструктурі (executor, AiRun, `AiUsageDaily`, бюджети, кеш — з `extract-job`).
- Embeddings (pgvector) + семантичний компонент matching.
- Golden-set evals для `analyze-job` (для `extract-job` — уже з R1).

Деталі — `07-ai.md`, FR-AI.

### 2.5. Later (без строків)

Browser extension (MV3) · AI-чат із діями (tool calling + confirm) · Google Calendar sync · Skill Gap Analyzer · Salary analytics · Company notes/intelligence · similarity-dedup + manual review · UA-локалізація · монетизація.

**After R1-lite** (ADR 025; задачі — `mvp-tasks.md` «Later — after R1-lite», беруться за цінністю або разом із хостингом): outbox + in-app consumers · email + password, reset, verification, linking, sessions UI, re-auth (FR-AUTH-05…10) · stale-підказки, edit/delete подій, contacts, interviews + `.ics`, custom reminders (FR-APP-14…16, FR-REM-04…07, FR-INT-*) · notification centre, доставка нагадувань, quiet hours, email + digest (FR-NOTIF-01…04, FR-PROF-02) · Jobs list/search/filters/detail, `UserJob`, sanitized HTML (FR-JOB-10, FR-DISC-01…05) · documents/CV (FR-DOC-*) · решта профілю: experience, education, languages, links, salary, hard filters · Dashboard, Analytics, R1-навігація, onboarding R1 (FR-DASH-03/04, FR-ANL-*) · async export, видалення акаунта, retention (FR-PRIV-01/02) · обмеження demo і purge (FR-DEMO-02…05) · metrics + Prometheus/Grafana · k6/Lighthouse · admin TOTP + Bull Board · повна privacy policy.

**When hosting** (ADR 022; лише після рішення хостити, варіанти — `12-infra-ops.md` §2.1): `terraform apply` + секрети, перший live deploy (`deploy-prod.yml` на push `main`) і перевірка `_headers` на Pages custom domain, off-site бекапи в R2 + Telegram, зовнішній uptime-check, WAL-G, scheduled restore test, staging + release flow `v*`, live `@smoke`, demo з Turnstile на публічному хості.

## 3. Єдиний таймлайн (milestones)

Тижні рахуються від старту, при 15–20 год/тиждень. Реліз = останній milestone блоку.

| Milestone | Тижні | Год | Зміст | Реліз |
|---|---|---|---|---|
| M0 Setup | 1 | 12–15 | monorepo, CI, compose, Google OAuth + allowlist, `UserSettings`, production images + `compose.prod.yml` + Terraform (deploy-ready, перевірка в CI), локальний `pg_dump`-скрипт; **spike версій**: NestJS 12 (fallback 11) з `nestjs-zod` і `@thallesp/nestjs-better-auth`, BullMQ 6 ↔ `@nestjs/bullmq` (інакше власна обгортка) — див. `04-architecture.md` §7 | |
| M1 Tracker | 2–3 | 22–26 | applications CRUD + delete, Kanban, Table, Detail, timeline, transitions + idempotency + undo, ручна вакансія, next action, Today/Overdue | |
| M2 Migration | 4 | 11–14 | CSV import (preview → commit), експорт CSV/JSON, IDOR-тести applications, полірування для щоденного використання, seed + demo sign-in без Google, devcontainer/Codespaces, portfolio README | **R0** (кінець тижня 4) |
| M3 Capture | 5–6 | ≈21.5 | worker (без outbox), AuditLog, safe-fetcher + capture API/UI, Playwright infra + E2E flows 1–4 | |
| M4 Profile, Matching & AI | 7–8 | ≈34 | мінімальний профіль + skills, синхронна skill extraction, matching-lite + UI, AI executor, `extract-job` + golden set (один провайдер), capture LLM fallback, AI settings | |
| M5 Launch | 9 | ≈11.5 | `@smoke`, OpenAPI ↔ routes, a11y pass, `/bot`, README refresh, security pass | **R1-lite** (кінець тижня 9; ADR 025) |
| M6 Ingestion | 10–11 | 30–40 | передумови з «After R1-lite» (outbox, Jobs list/search, `UserJob`) + adapters, normalization, salary + курси + salary-фільтр Jobs, dedup, source health | |
| M7 Matching | 12–13 | 30–40 | matching v1 (на базі matching-lite), feedback, saved searches + digest, OTel | **R2** (кінець тижня 13) |
| M8 AI | 14–16 | 45–60 | решта AI tasks, evals `analyze-job`, embeddings | **R3** (кінець тижня 16) |

Між R0 і M3 допустима пауза на dogfooding (1–2 тижні) — таймлайн зсувається цілком.

## 4. Backlog (епіки → GitHub Issues)

Нумерація issues — `E<NN>-<nn>` (наприклад `E03-04`), щоб не плутати з ID ревʼю (`A-01`, `P-04`). Кожен issue має AC і посилання на `FR-*` або розділ спеки.

ADR 025: колонка «Реліз» нижче — до звуження. Зараз у R1-lite з R1-частин епіків лишились: E04 (safe fetcher, JSON-LD, політика доменів, JobDraft UI; без `UserJob`), E07 (лише skills + мінімальний профіль), E10 (worker, AuditLog, Sentry), E13 (`extract-job`), а з E12 — matching-lite. Решта R1-частин E02, E03, E05, E06, E08, E09, E10 — Later (§2.5).

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
| E10 Platform & Ops | outbox + relay, AuditLog, export/delete pipelines, demo (ефемерний), Sentry, pino redaction, Prometheus/Grafana, CSP/headers, deploy-ready (images, compose.prod, Terraform, CI checks), local backups, devcontainer; when hosting — provisioning, deploy, R2-бекапи, WAL-G, restore-тест, staging | R0 (deploy-ready, local backups, CSP/headers, Sentry api, demo sign-in) / R1 / Later |
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
- Нові метрики/алерти, якщо з'явився новий процес або черга (див. `12-infra-ops.md`). У R1-lite не вимагається, поки metrics/Prometheus у Later (ADR 025).
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
- ADR 022 (2026-11-16): R0/R1 deploy-ready, не hosted (D-01 superseded); demo sign-in (FR-DEMO-01) — у R0 для local/Codespaces; exit criteria R0/R1 без prod-хоста; хостинг-задачі — §2.5 «When hosting».
- ADR 025 (2026-11-19): R0 без змін; R1 → R1-lite (§2.2): capture, `extract-job` (один провайдер), matching-lite (з R2, рахується при читанні), E2E; без outbox. Решта R1 — §2.5 «After R1-lite». Таймлайн M3–M8 зсунуто (R1-lite — тиждень 9). Критерій виходу «Grafana» знято.
