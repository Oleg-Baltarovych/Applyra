# Продукт: цілі, користувач, scope

> Applyra spec v2.1 · Зона: навіщо, для кого, scope-рішення, портфоліо, ризики, прийняті рішення · Пов'язані: `00-overview.md`, `02-releases.md`, `03-functional.md`

## 1. Контекст і цілі

### 1.1. Що це

Applyra — web-застосунок, персональний робочий простір для пошуку роботи: вакансії з різних джерел в одному місці,
CRM для відгуків, пояснюваний match score і AI-помічник для рутинних текстових задач.

**Позиціонування:** _Your job search, under control._ Не job board. Головне — **pipeline і рішення**, а не кількість вакансій.

### 1.2. Цілі (в порядку пріоритету)

| # | Ціль | Що означає на практиці |
|---|---|---|
| G1 | **Портфоліо** | Задеплоєний production-grade проєкт: demo, тести, CI, ADR, README. Показує те, чого не видно в CRUD: ingestion, черги, дедуп, пошук, AI зі structured output, безпеку, observability |
| G2 | **Dogfooding** | Автор шукає роботу (Full-stack, remote, UA-ринок: Djinni, DOU, robota.ua, LinkedIn). R0 замінює Google Sheets за 3–4 тижні (див. `02-releases.md` §2) — головне джерело фідбеку |
| G3 | **Комерційний потенціал** | Опція. Не впливає на рішення до R3. Монетизація, billing, тарифи — поза scope |

### 1.3. Не-цілі

- Auto-apply — ні зараз, ні пізніше без окремого рішення (ADR).
- Scraping в обхід ToS, авторизації, CAPTCHA, anti-bot.
- Мікросервіси, окремий search-кластер, нативні мобільні застосунки.
- Multi-tenant для команд або рекрутерів.
- Надсилання будь-чого від імені користувача (листи, повідомлення рекрутерам).

## 2. Користувач і сценарії

### 2.1. Основна персона

**Middle/Senior IT-фахівець з України, який активно шукає remote-роботу.**

- 3–5 платформ: Djinni, DOU, robota.ua / work.ua, LinkedIn, кар'єрні сторінки компаній.
- Частина можливостей **вхідні**: рекрутер пише в Djinni / LinkedIn / Telegram, окремої сторінки вакансії часто немає.
- Зарплати переважно USD/міс, інколи gross/net, інколи «від».
- Типовий біль — **ghosting**: після відгуку тиша; людина забуває, куди і коли подавалася і чи варто нагадати.
- 1–3 версії CV під різні ролі.

### 2.2. Jobs-to-be-done

| # | Сценарій | Реліз | Примітка |
|---|---|---|---|
| J1 | «Знайшов вакансію — швидко зберіг її» | R0 (форма + paste text) / R1 (URL capture «за 15 с») | P-11: без JSON-LD/LLM 15 с недосяжні, тож обіцянка «15 с» — з R1 |
| J2 | «Бачу всі свої відгуки, їхній статус і що робити далі» | R0 | |
| J3 | «Мені нагадали зробити follow-up, і я не загубив можливість» | R0 (Today/Overdue in-app) / R1 (email) | |
| J4 | «Розумію, які вакансії реально мені підходять і чому» | R2 | |
| J5 | «Не бачу ту саму вакансію п'ять разів із різних джерел» | R2 | |
| J6 | «Швидко отримав розбір вакансії, питання до рекрутера й чернетку відповіді» | R3 | |
| J7 | «Бачу, що в моєму пошуку працює, а що ні (джерела, конверсія)» | R1 (база) / R2 | |

Вимоги до кожного сценарію — `03-functional.md`.

## 3. Ключові рішення щодо scope

Blueprint v1.0 описував повний комерційний SaaS; для соло-розробника паралельно з пошуком роботи це не доходить до релізу.

| # | Рішення | Чому |
|---|---|---|
| D1 | MVP розбито на **R0 → R1 → R2 → R3**, кожен реліз окремо деплоїться і корисний сам по собі | 25 пунктів «Must Have» у v1.0 — не MVP |
| D2 | **Ручний capture** (форма + paste text) — R0; **URL capture (JSON-LD → LLM)** — R1. Автоматичні адаптери — R2 і тільки для джерел із публічним API/feed | Продукт корисний без інтеграцій; SSRF-fetcher не влазить у R0 (P-01, P-11) |
| D3 | Перші адаптери: **Greenhouse, Lever, Ashby** (публічні job board API) і **DOU** (RSS). Djinni, robota.ua, work.ua, LinkedIn — **тільки user-initiated capture** за політикою доменів (див. `03-functional.md` FR-JOB) | Немає відомого публічного API для пошукача. ToS-check — див. `08-ingestion-matching.md` |
| D4 | **Matching v1 детермінований** (словник навичок + ваги); семантика (pgvector) — R3 | Тестується unit-тестами, пояснюється без LLM |
| D5 | «My Matches», «Interviews», «AI Assistant» **не окремі сторінки**: matches — сортування/фільтр у Jobs, інтерв'ю — частина Application, AI — контекстні кнопки | Менше поверхні, швидший реліз |
| D6 | `UserJob` (saved/hidden/viewed) окремо від `Application.status`; «Applied» не дублюється у стані вакансії | У v1.0 «Saved» був і у вакансії, і в pipeline |
| D7 | `Application.origin` (сам / рекрутер / referral) і статус **GHOSTED** (ставить тільки користувач) | Реалії UA-ринку: inbound у Djinni, тиша після відгуку |
| D8 | Без `job_source_links`: кожна публікація джерела належить рівно одній канонічній вакансії | Many-to-many для one-to-many зайвий |
| D9 | Вакансії мають **visibility**: PUBLIC (каталог з ingestion) і PRIVATE (capture користувача) | Privacy: вручну додана вакансія не видна іншим |
| D10 | API і worker — **один NestJS codebase із двома entrypoint** | Без дублювання бізнес-логіки |
| D11 | **Transactional outbox** для доменних подій — з R1; у R0 побічні ефекти синхронно в тій самій транзакції | Надійна доставка подій; R0 не потребує worker (A-03) |
| D12 | Монетизація, billing, Company Intelligence, Autofill, AI-чат із діями — **Later** | Не впливають на цінність перших релізів |

Архітектурні деталі D8–D11 — див. `04-architecture.md`, `05-data-model.md`.

## 4. Позиціонування відносно резюме автора

Автор: ~4 роки комерційного досвіду Node.js/TypeScript/NestJS/React (AdTech, crypto), зокрема розбиття моноліту на
сервіси і service-to-service push-платформа. Applyra має **підтвердити** сильні сторони і **закрити прогалини**.

### 4.1. Сильні сторони, які проєкт перевикористовує

| З резюме | Де видно в Applyra |
|---|---|
| NestJS | modular monolith з enforced boundaries, два entrypoint (HTTP + worker) |
| React | Kanban з optimistic updates і keyboard DnD, складні фільтри, Cmd+K, a11y |
| PostgreSQL | FTS + trigram, partial unique indexes, `EXPLAIN ANALYZE` в ADR про пошук |
| Черги / async (push-платформа) | outbox, ідемпотентні consumers, retries/backoff, DLQ, source health |
| Docker | Compose локально і в prod (VPS), multi-stage images |
| Prometheus / Grafana | метрики API/черг/AI cost, dashboards і alerts as code — з R1 (P-17) |

### 4.2. Прогалини, які проєкт закриває

| Прогалина в CV | Чим закривається |
|---|---|
| Testing | Vitest, Testcontainers, IDOR suite, contract-тести, Playwright E2E (див. `11-testing.md`) |
| Security | SSRF-захист, IDOR, CSP/headers, signed URLs, redaction, supply-chain checks (див. `09-security-privacy.md`) |
| Prisma | Prisma 7 + raw SQL для FTS/partial indexes, drift-check у CI |
| BullMQ | worker, job schedulers, ідемпотентні jobs, Bull Board за admin-доступом |
| GitHub Actions | CI gates, deploy, pinned actions, OIDC/Environments (див. `12-infra-ops.md`) |
| LLM-інтеграція | structured output + Zod, evals, prompt-injection захист, бюджети (див. `07-ai.md`) |

### 4.3. Сигнали для рекрутера / інтерв'юера

| Сигнал | Підтвердження |
|---|---|
| Backend-архітектура, не лише CRUD | modular monolith, outbox, ідемпотентні consumers, ADR |
| Робота з даними | нормалізація, дедуплікація, FTS + trigram, partial indexes |
| Асинхронні системи | BullMQ, retries, DLQ, source health, OpenTelemetry через черги (R2) |
| Full-stack, сильний frontend | Kanban, фільтри, a11y |
| LLM-інтеграція | structured output, evals, cost control |
| Security mindset | IDOR suite, SSRF, signed URLs, CSP |
| Інженерна культура | CI gates, Testcontainers, E2E, conventional commits, README, ADR |
| DevOps | Docker, CI/CD, Terraform (VPS, DNS, R2), Prometheus/Grafana |

## 5. Портфоліо-артефакти

### 5.1. До R1

- [ ] Live URL + **«Try demo»** без реєстрації: ефемерний demo-користувач на відвідувача (див. `03-functional.md` FR-DEMO).
- [ ] README: абзац «що це», GIF/скріншоти, архітектурна діаграма, stack, «Key engineering decisions» з посиланнями на ADR, локальний запуск.
- [ ] `docs/adr/` — ADR актуальні (перелік — `docs/adr/README.md`).
- [ ] Зелений CI badge, відкриті issues/roadmap.
- [ ] Публічний репозиторій з першого дня: gitleaks у CI, тільки синтетичні дані у фікстурах і seed.

### 5.2. Після R2

- [ ] Технічна стаття (DOU або dev.to) про одну частину: дедуплікацію, outbox або matching.

### 5.3. Як подати в CV

Секція **Projects** (не Work Experience; не видавати за комерційний досвід). Шаблон — **заповнювати тільки реальними даними після реалізації**:

> **Applyra** — job-search workspace · [live] · [GitHub]
> React, NestJS, PostgreSQL, Redis/BullMQ, Prisma, Docker, GitHub Actions, Prometheus/Grafana, [LLM provider]
> - Designed a modular-monolith backend with a transactional outbox and idempotent BullMQ consumers for job ingestion from [N] public sources.
> - Built multi-level vacancy deduplication (external ID → canonical URL → fingerprint) and explainable match scoring with confidence for missing data.
> - Implemented LLM-based vacancy extraction with schema-validated structured output, prompt-injection safeguards and per-user cost limits.
> - Covered authorization with an automated IDOR test suite; [X]% coverage of domain logic; E2E with Playwright.

Ці формулювання — також готові відповіді на «Tell me about a project you're proud of».

## 6. Ризики

| Ризик | Ймовірність | Мітигація |
|---|---|---|
| Scope creep → проєкт не доходить до релізу | **висока** | урізаний R0 (~45–55 год), кожен реліз окремо корисний; нові ідеї → `Later` |
| Pet project з'їдає час пошуку роботи | висока | R0 сам економить час (dogfooding); R1 дає рядок у CV (строки — `02-releases.md` §3) |
| Втрата реальних даних автора в R0 | середня | нічний `pg_dump` уже в R0 (P-23), експорт CSV/JSON |
| Джерела закривають доступ / змінюють формат | середня | capture-first, ізольовані адаптери, фікстури, source health, auto-disable |
| Сайти блокують URL capture | висока | «paste text» — рівноправний шлях; extension — Later |
| Юридичні претензії джерела | низька | політика доменів (LinkedIn — тільки paste), captured content лишається PRIVATE |
| Неточний match → недовіра | середня | пояснення, confidence, unknowns, feedback |
| AI вигадує | середня | evidence у схемах, обов'язкове підтвердження, golden-set evals |
| Вартість AI | низька–середня | tiers fast/smart, кеш, ліміти на користувача, глобальний денний ліміт у USD, demo — заглушка/жорсткий ліміт |
| Зловживання demo (XSS-контент, AI-бюджет, SSRF) | середня | ефемерний demo на відвідувача, без uploads/URL capture/email |
| Витік CV / даних | низька, але критична | `09-security-privacy.md`, IDOR suite, signed URLs, без публічних файлів |
| Секрети або реальні дані в публічному репо | середня | gitleaks у CI, тільки синтетичні дані |

## 7. Прийняті рішення (колишні відкриті питання)

| # | Питання | Рішення | Де деталі |
|---|---|---|---|
| Q1 | Реєстрація в R1 | **Invite-only** (allowlist реєстрації) + ефемерний demo для всіх | `03-functional.md` FR-AUTH, FR-DEMO |
| Q2 | Мова | Спека — українською; `00-overview.md`, код, README, ADR — англійською | `00-overview.md` |
| Q3 | Хостинг | **VPS (Hetzner) + Docker Compose + Caddy + Terraform** (VPS, DNS, R2) для API; SPA — Cloudflare Pages на `app.<domain>`. Без AWS | `12-infra-ops.md` |
| Q4 | LLM-провайдер | **Один провайдер** зі schema-enforced structured output за `AIProvider`; вибір — у M4 за результатами golden set | `07-ai.md` |
| Q5 | Публічний репо | **Так, з першого дня**; gitleaks у CI; тільки синтетичні дані | `11-testing.md`, `12-infra-ops.md` |
| Q6 | UA-локалізація | **Later**. З R0 — форматування дат/чисел/валют через `Intl` (без хардкоду форматів); i18n-бібліотека — при локалізації | `10-frontend-ux.md` |
| Q7 | Курси валют | **НБУ** public API; при недоступності — останній відомий курс (last-known fallback) | `08-ingestion-matching.md` |
| R-1 | Обсяг R0 | Урізаний за SPEC-REVIEW §3, ≈45–55 год, 3–4 тижні | `02-releases.md` |
| R-2 | Outbox | R0 — синхронно в транзакції; outbox + BullMQ — з R1 | `04-architecture.md` |
| R-3 | Домени | `app.<domain>` + `api.<domain>` (same-site), `__Host-` cookies, `SameSite=Lax`, CORS allowlist | `09-security-privacy.md` |
| R-4 | БД | PostgreSQL 18 з `uuidv7()`; Better Auth `generateId` → UUID v7 | `05-data-model.md` |
| R-5 | Observability | Prometheus + Grafana (as code) — R1; Sentry; OpenTelemetry — R2 | `12-infra-ops.md` |
| R-6 | Demo | Ефемерний користувач на відвідувача (TTL 24 год), без uploads/URL capture/email, AI — заглушка або жорсткий ліміт | `03-functional.md` FR-DEMO |
| R-7 | Модулі | companies → jobs; search → jobs; dedup → ingestion; similarity-dedup і OTel відкладені | `04-architecture.md` |
| R-8 | Структура спеки | `docs/spec/*.md` (v2.1); `docs/SPEC.md` v2.0 — у git-історії | `00-overview.md` |

## Зміни відносно v2.0

- P-01, P-11: J1 і D2 — URL capture перенесено в R1; R0 = форма + paste text.
- P-17: додано §4 «Позиціонування відносно резюме» (Prometheus/Grafana видно з R1).
- P-16 / S-15: demo — ефемерний на відвідувача (артефакти §5.1, ризики §6).
- P-18: ризик ToS і політика доменів (LinkedIn — тільки paste).
- P-20: строки прибрано з ризиків — посилання на єдину таблицю в `02-releases.md`.
- P-23: ризик втрати даних R0 → нічний `pg_dump` у R0.
- A-03: D11 — outbox з R1, у R0 синхронно.
- SPEC-REVIEW §4 (1–10), Q1–Q7: §20 «Відкриті питання» → §7 «Прийняті рішення».
- D7: GHOSTED ставить тільки користувач (P-04).
- Технічна стаття перенесена після R2 (тема — дедуп/matching, які з'являються в R2).
