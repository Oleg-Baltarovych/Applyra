# Інфраструктура, деплой та observability

> Applyra spec v2.1 · Зона: середовища, хостинг, БД і бекапи, міграції, CI/CD, метрики, алерти, NFR · Пов'язані: `02-releases.md`, `04-architecture.md`, `05-data-model.md`, `09-security-privacy.md`, `11-testing.md`

## 1. Середовища (I-04, ADR 022)

**Portfolio mode (ADR 022):** у R0/R1 **немає постійно розгорнутого середовища**. Основне середовище — **local** (і GitHub Codespaces через devcontainer — той самий local). Результат — deploy-ready репозиторій: production images, `compose.prod.yml`, Terraform, deploy workflow існують і перевіряються в CI (§8.1), але не застосовуються. Колонки staging/production нижче — цільовий стан **«when hosting»** (`docs/plans/mvp-tasks.md` → `Later — when hosting`); D-01 (R0 на prod-хості) — superseded.

| | local (основне; також Codespaces) | staging (when hosting, опційно) | production (when hosting) |
|---|---|---|---|
| Запуск | `cp .env.example .env && docker compose up -d` (postgres, redis, minio, mailpit) + `pnpm dev` (web + api; + worker з R1, turbo); `compose.prod.yml` можна підняти локально для перевірки images | VPS, Compose (API) + Cloudflare Pages (SPA) | VPS, Compose (API) + Cloudflare Pages (SPA) |
| Deploy | — | auto з `main` | тег `v*` + approval у GitHub Environment `production` |
| Дані | `pnpm db:seed` (synthetic); у R0 автор веде реальні дані локально (dogfooding, бекап — §5) | **тільки synthetic** seed; реальні дані/бекапи prod сюди не потрапляють | реальні |
| Вхід | demo sign-in без Google (`DEMO_ENABLED=true` за замовчуванням, FR-DEMO-01); Google — якщо задано `GOOGLE_CLIENT_ID/SECRET` | Google + demo (з Turnstile, FR-DEMO-05) | Google (+ demo лише з Turnstile) |
| Google OAuth client | dev client (`localhost`), опційний | окремий client | окремий client |
| LLM key | dev key з низьким лімітом / stub | окремий key, жорсткий місячний cap у провайдера | окремий key |
| Email | Mailpit | provider sandbox / allowlist отримувачів | provider prod |
| Storage | MinIO — image `cgr.dev/chainguard/minio` pinned by digest (офіційні community-images MinIO припинені); той самий у Testcontainers; S3 API / ADR 010 без змін | R2 bucket `applyra-staging-*` | R2 bucket `applyra-prod-*` |
| Домен | `localhost:5173` / `:3000` | окремий registrable domain (`<staging-domain>`) | `<domain>` |
| Sentry | вимкнено (SDK ініціалізується лише при `SENTRY_DSN`) | `environment=staging` | `environment=production` |

Секрети не шаряться між середовищами; R2-токени — scoped на bucket(и) свого середовища.

**When hosting:** спершу лише production (один VPS або ARM VM, §2.1); synthetic-only staging (окремий registrable domain) і release flow через тег `v*` + approval — опційно, за ADR 011. Demo на публічному хості вмикається тільки разом із Turnstile і лімітами (`09-security-privacy.md` §11).

## 2. Хостинг (рішення 3, I-01; ADR 011, ADR 022)

У R0/R1 нічого не хоститься (ADR 022). Нижче — цільова конфігурація, під яку написані Terraform/Compose/images (paid fallback, ADR 011), і безкоштовні варіанти (§2.1).

| Компонент | Вибір |
|---|---|
| Compute | Hetzner Cloud VPS: prod — 2–4 vCPU / 4–8 GB (CX22–CX32-клас; R0-навантаження вміщується в менший), staging (опційно) — 2 vCPU / 4 GB; або ARM VM (§2.1) — images multi-arch (amd64 + arm64) |
| Оркестрація | Docker Compose (`infra/compose/compose.yml` + `compose.prod.yml` / `compose.staging.yml`). R0: caddy (+ SPA static з тими самими headers, що `_headers`), api, `migrate`, postgres, redis — **без worker**; R1+: + worker, safe-fetcher, профіль `observability`; backup-cron (R2) — when hosting |
| Queue/cache store | Compose-сервіс `redis`, image `valkey/valkey:9` (Redis-protocol compatible; `04-architecture.md` §7.2). Той самий image — у local compose і Testcontainers для BullMQ; «Redis» у спеці — назва протоколу/сервісу |
| Edge / TLS | Caddy (ACME, HTTP/2-3) перед API на VPS |
| SPA | **Cloudflare Pages** з custom domain `app.<domain>` (same-site з `api.<domain>`, ADR 008/011); security headers — файл `_headers` (`09-security-privacy.md` §9.1). Fallback: статика в Caddy image на VPS з тими самими headers |
| DNS / CDN | Cloudflare (proxied), Hetzner firewall: 80/443 тільки з Cloudflare IP ranges |
| Object storage | Cloudflare R2 (documents, exports, backups — окремі buckets) |
| IaC | Terraform: `infra/terraform/{modules,envs/production}` (+ `envs/staging`, якщо staging) — providers `hcloud` (VPS, firewall, volumes), `cloudflare` (DNS, Pages project + custom domain, R2 buckets, lifecycle rules); state у R2 (S3 backend, `use_lockfile = true`) — when hosting; у CI — `fmt -check` + `validate` з `init -backend=false` без credentials; cloud-init встановлює Docker, Tailscale, host firewall |
| Email | Resend або Postmark |
| Без AWS | рішення 3; ADR 011 |

**Оцінка вартості:** R0/R1 у portfolio mode — **€0/міс** (CI на GitHub Actions; LLM — dev key з низьким cap або stub, `07-ai.md`). When hosting (≈, листопад 2026):

| Стаття | €/міс |
|---|---|
| Prod VPS + volume (або Oracle A1 — 0, §2.1) | ~5–10 |
| Staging VPS (опційно; можна вимикати поза роботою) | ~4–5 |
| R2 (≤ 10 GB free, egress безкоштовний; бекапи 14 днів) | 0–2 |
| Домен(и) | ~1–2 |
| Cloudflare (DNS, Pages), Sentry (developer), Tailscale (personal), email (free tier) | 0 |
| LLM (cap у провайдера) | 5–10 |
| **Разом** | **~5–10** (один VPS, без LLM) … **~20–30** (два VPS + LLM) (AWS-варіант v2.0: ~$60–100) |

### 2.1. Якщо хостити пізніше (дані станом на 2026-11, перевірити перед використанням)

| Варіант | Оцінка |
|---|---|
| (a) **Oracle Cloud Always Free, Ampere A1** | 2 OCPU / 12 GB на tenancy (було 4 / 24; зменшено у 2026, дати набуття чинності в джерелах різняться); картка при реєстрації; A1-capacity часто дефіцитна; idle або понадлімітні інстанси можуть бути reclaimed. Той самий Compose-стек без змін (тому arm64 images) |
| (b) **PaaS free tiers** — погано підходять | Render free web service засинає після ~15 хв простою (~1 хв cold start), free Postgres видаляється через 30 днів; Railway / Fly.io — без постійного free tier для нових акаунтів; Neon free Postgres (1 GB/project, 100 CU-год) підходить для БД, але BullMQ worker (R1) потребує always-on процесу + Redis |
| SPA | Cloudflare Pages free — підходить у будь-якому варіанті |
| (c) **Paid fallback** | ADR 011: один Hetzner VPS, ~€5–10/міс; staging — опційно |

## 3. Домени, мережа, доступ

### 3.1. Домени (рішення 4)

| Host | Що |
|---|---|
| `app.<domain>` | SPA (Cloudflare Pages, custom domain; fallback — Caddy static) |
| `api.<domain>` | API (`/api/v1/*`, `/api/auth/*`, `/health/*`); same-site з `app.` — cookies/CSRF див. `09-security-privacy.md` §3 |
| `<domain>` | redirect на `app.` (landing — Later) |
| staging | `app.<staging-domain>`, `api.<staging-domain>` — інший site, щоб staging-cookies/Origin не перетиналися з prod |

### 3.2. Docker-мережі

| Мережа | Сервіси | Примітка |
|---|---|---|
| `edge` | caddy, api | тільки Caddy публікує 80/443 |
| `internal` (`internal: true`) | api, worker, migrate, postgres, redis, prometheus, exporters, grafana | без виходу в інтернет; api/worker виходять назовні через `outbound` |
| `outbound` | api, worker | вихід до LLM, email, R2, джерел ingestion (R2) |
| `fetch-rpc` | worker, safe-fetcher, prometheus | тільки RPC worker → fetcher [R1]; api сюди не входить (capture — через чергу `capture`, ADR 021); prometheus — лише scrape safe-fetcher `:9466` |
| `egress` | safe-fetcher | тільки інтернет; host-правила `DOCKER-USER` дропають з її subnet трафік до RFC 1918, `100.64/10`, `169.254/16`, IP хоста (SSRF — `09-security-privacy.md` §5) |

- Postgres, Redis, Prometheus, Grafana, Bull Board, `/metrics` — **не публікуються** на host-порти й не маршрутизуються Caddy.
- Адмін-доступ: SSH і Grafana/Bull Board/Prometheus — тільки через Tailscale (публічний порт 22 закритий); Bull Board додатково за admin-guard (S-19).
- Реальний IP клієнта: Caddy довіряє `CF-Connecting-IP` тільки з Cloudflare ranges.

## 4. PostgreSQL 18 (рішення 5)

- Image `postgres:18.x` (pinned digest); з R3 — `pgvector/pgvector:pg18`.
- Нативний `uuidv7()` для `@default`; Better Auth `generateId` теж видає UUID v7 (див. `05-data-model.md`).
- Extensions: `pg_trgm`, `unaccent` (R0), `vector` (R3) — створюються міграцією (`05-data-model.md` §7.1).
- Data checksums увімкнені (default initdb у 18); `shared_buffers` ~25% RAM; `statement_timeout = 30s` для ролі застосунку; `idle_in_transaction_session_timeout = 60s`.
- Ролі (створює init-скрипт / Terraform cloud-init, паролі — секрети §7):

| Роль | Хто | Права |
|---|---|---|
| `applyra_app` | api, worker (runtime) | DML на доменні таблиці, без DDL; на `"AuditLog"` тільки `INSERT`/`SELECT` (`05-data-model.md` §7.5) |
| `applyra_maintenance` | one-off job `migrate`, retention-jobs (audit/tombstone cleanup, анонімізація) | власник схеми (DDL), `UPDATE ("ip","userAgent")`/`DELETE` на `"AuditLog"` |
| `backup` | WAL-G, `pg_dump` | replication / read |
| `metrics` | `postgres_exporter` | `pg_monitor` |
- Major upgrade — окремий runbook (pg_upgrade або dump/restore + restore test).

## 5. Backups і restore (I-02, P-23, ADR 022)

**Зараз (R0/R1, local):** реальні дані автора (dogfooding) живуть у локальному Postgres volume. Скрипт `pnpm db:backup` — `pg_dump -Fc` (роль `backup`) у `./backups/` (gitignored), зберігаються останні 14 файлів; запуск вручну або з cron/Task Scheduler хоста. `pnpm db:restore <file>` відновлює в ізольований контейнер `postgres:18`; ручна перевірка restore — R0 exit-критерій (`02-releases.md` §2.1). Плюс FR-IMP-05 експорт як незалежна копія. RPO = частота запуску скрипта.

**When hosting** (`docs/plans/mvp-tasks.md` → `Later — when hosting`):

| | Етап 1 (з першого deploy) | Етап 2 (опційно) |
|---|---|---|
| Метод | nightly `pg_dump -Fc` (cron-контейнер) | **WAL-G**: безперервний WAL archiving + щоденний base backup (`backup-push`); nightly `pg_dump` лишається як другий незалежний шлях |
| Шифрування | `age` (публічний ключ на сервері, приватний — офлайн + password manager) | WAL-G libsodium encryption + той самий підхід до ключів |
| Сховище | R2 bucket `applyra-prod-backups` (окремий token тільки на цей bucket, без delete) | те саме |
| Retention | 14 днів (R2 lifecycle + `wal-g delete retain`) | 14 днів, PITR у межах вікна |
| RPO | ≤ 24 год | ≤ 5 хв (`archive_timeout = 60s`) |
| RTO | ≤ 4 год | ≤ 2 год |
| Restore test | ручний після першого бекапу | **щомісяця**, scripted (нижче) + перед кожним major upgrade |

**Monthly restore test** (when hosting; `.github/workflows/restore-test.yml`, Environment `backup-restore`):
1. CI через Tailscale запускає на prod-хості ефемерний контейнер `postgres:18` в ізольованій мережі (дані не залишають prod-інфраструктуру й не потрапляють у CI-логи).
2. `wal-g backup-fetch LATEST` + PITR до `now() - 1h`; окремо — restore останнього `pg_dump`.
3. Перевірки: `prisma migrate status` = актуальний, row counts ключових таблиць у межах ±5% від prod, `max("createdAt")` новіший за 26 год, повторне видалення користувачів із `DeletedUserTombstone` (`09-security-privacy.md` §12.1) не падає.
4. Метрика `backup_restore_test_last_success_timestamp_seconds` + звіт у Telegram; падіння → alert і issue. Контейнер знищується.

Метрики свіжості бекапу — через node_exporter textfile collector (§10).

## 6. Міграції (I-03)

| Правило | Як забезпечено |
|---|---|
| Тільки backward-compatible зміни в одному релізі: **expand → migrate (backfill) → contract** у різних релізах | review + squawk + `@compat` тести (`11-testing.md` §5.5) |
| Лінтер | **squawk** у CI на нових `prisma/migrations/**/migration.sql`: заборона `ADD COLUMN … NOT NULL` без default на великих таблицях, зміни типу, `DROP COLUMN` без попереднього expand, неконкурентних індексів на великих таблицях, `require-timeout-settings` |
| Timeouts | кожна міграція починається з `SET lock_timeout = '5s'; SET statement_timeout = '60s';` |
| Індекси | на великих таблицях — `CREATE INDEX CONCURRENTLY` в окремій міграції з одним statement |
| Drift | `prisma migrate diff --exit-code` у CI (A-10) |
| Застосування | one-off job `migrate` (той самий image, що api, `prisma migrate deploy`, роль `applyra_maintenance` через `MAINTENANCE_DATABASE_URL`) **до** rollout api; падіння → deploy зупиняється, стара версія продовжує працювати |
| Відкат | roll-forward; застосовані міграції не редагуються |
| Backfill | batched (≤ 1 000 рядків/транзакція) BullMQ job або окремий скрипт, ідемпотентний |

## 7. Конфігурація і секрети

- `.env.example` у корені — повний список змінних з коментарями; реальні `.env*` не комітяться.
- Конфіг валідується Zod на старті кожного процесу (`apps/api/src/platform/config/env.schema.ts`, `apps/web` — тільки `VITE_*` публічні значення); відсутня/невалідна змінна → процес падає з переліком помилок.
- Опційні інтеграції не блокують local-старт: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Google provider реєструється лише коли задані обидва), `SENTRY_DSN`, LLM key (`AI_MODE=stub` за замовчуванням у `.env.example`). `DEMO_ENABLED=true` у `.env.example`; у `NODE_ENV=production` demo дозволено лише з налаштованим Turnstile (`09-security-privacy.md` §11), інакше процес падає на старті.
- When hosting: prod/staging секрети — у GitHub Environment secrets; deploy job рендерить `/opt/applyra/.env` (`0600`, owner deploy-user) на хості через Tailscale SSH.
- DB: `DATABASE_URL` — роль `applyra_app` (api, worker); `MAINTENANCE_DATABASE_URL` — роль `applyra_maintenance` (тільки `migrate` і retention-jobs; worker відкриває окремий pool лише для них).
- Feature flags середовища — теж через валідований конфіг (`CAPTURE_ENABLED`, `DEMO_ENABLED`, `AI_MODE=live|stub|off`, ліміти AI — `07-ai.md` §4).

## 8. CI/CD pipeline і release flow

### 8.1. Workflows (`.github/workflows/`)

**Зараз (у CI, R0/R1)** — deploy-ready перевіряється статично, нічого не застосовується (ADR 022):

| Workflow | Тригер | Стадії |
|---|---|---|
| `ci.yml` | PR, push `main` | install (`--frozen-lockfile`) → lint/typecheck → unit → integration + IDOR → contracts → migrations check → **deploy-ready**: build images multi-arch (`linux/amd64,linux/arm64`, buildx; на PR без push), `docker compose -f … config -q` для `compose.yml`/`compose.prod.yml`, actionlint на workflows → supply chain → e2e (R1+). Gates — `11-testing.md` §9 |
| `terraform.yml` | PR зі змінами `infra/terraform/**` | `terraform fmt -check -recursive`, `init -backend=false` + `validate` (без credentials) |
| `deploy-prod.yml` | **тільки `workflow_dispatch`** (Environment `production`, без секретів до hosting) | кроки §8.2 для одного prod-хоста; у R0/R1 не запускається — лише lint (actionlint) у `ci.yml` |
| `nightly.yml` | cron | `pnpm audit`, header check проти `compose.ci.yml`; R1+: k6 + Lighthouse проти `compose.ci.yml` (орієнтир, не NFR-вимірювання), AI evals (manual/nightly) |
| `sast.yml` | PR + weekly | Semgrep CE (community rulesets, `--metrics=off`, finding → fail); CodeQL (`codeql.yml`) — коли репо стане публічним (ADR 023) |

**When hosting** (`Later — when hosting`):

| Зміна | Що |
|---|---|
| `deploy-prod.yml` | тригер push `main` (без staging) — images у GHCR (`sha-<commit>`) → deploy (§8.2) → `wrangler pages deploy` з `_headers` → smoke |
| `terraform.yml` | + `plan` (коментар у PR) з remote state у R2; `apply` — manual з approval |
| `restore-test.yml` | monthly cron + manual — §5 |
| staging (опційно) | `deploy-staging.yml` (push `main`) + `release.yml` (tag `v*`: retag digest, що пройшов staging → approval → deploy prod → smoke → Sentry release) замінюють auto-тригер `deploy-prod.yml` |

### 8.2. Стадії deploy (when hosting)

Колонки — обсяг коду на момент релізу; виконується лише після рішення хостити (ADR 022). Крок 1 (без push) і перевірка конфігів виконуються в `ci.yml` уже зараз.

| # | Крок | R0 | R1+ |
|---|---|---|---|
| 1 | build images multi-arch (api/worker — один image, різні `command`; caddy) з provenance attestation; build SPA (`apps/web/dist`) | ✓ | ✓ |
| 2 | pre-deploy backup marker (`pg_dump` / `wal-g backup-push`) | ✓ (prod) | ✓ (prod) |
| 3 | `docker compose run --rm migrate` | ✓ | ✓ |
| 4 | api rollout: нова репліка → healthcheck `/health/ready` → Caddy перемикає upstream → стара зупиняється (zero-downtime) | restart (короткий downtime ок) | ✓ |
| 5 | worker: SIGTERM → BullMQ `worker.close()` (до 30 с) → новий | — (worker з R1) | ✓ |
| 6 | SPA → Cloudflare Pages (`wrangler pages deploy`, з `_headers`); caddy | ✓ | ✓ |
| 7 | smoke (`11-testing.md` §6) | health-check | `@smoke` Playwright |
| 8 | Sentry release + upload sourcemaps (sourcemaps видаляються з `dist` до Pages deploy) | — | ✓ |
| 9 | Grafana annotation «deploy vX» | — | ✓ |

Rollback: redeploy попереднього image digest (схема сумісна завдяки expand/contract).

## 9. Логи, помилки, health, traces (рішення 6)

| Сигнал | Рішення | Реліз |
|---|---|---|
| Логи | pino JSON у stdout, `requestId` (+ `traceId` з R2) у кожному записі, redaction — `09-security-privacy.md` §10; docker `json-file` `max-size=10m, max-file=5`, retention ≤ 14 днів | R0 |
| Errors | Sentry: web + api + worker; ініціалізація лише при заданому DSN (local — вимкнено; hosted Sentry не обов'язковий, ADR 022); `sendDefaultPii: false`, `beforeSend` scrub, без Session Replay; `tracesSampleRate: 0` (traces — OTel) | R0 (api), R1 (web, worker) |
| Health | api: `GET /health/live` (процес), `GET /health/ready` (Postgres `SELECT 1`, Redis `PING`; R1 + R2-storage HEAD з кешем 30 с); worker (R1+): `/health` на внутрішньому порту 9465 + heartbeat-метрика | R0 (api) |
| Metrics | Prometheus + Grafana, `prom-client`; local — Compose-профіль `observability` (порти лише на `127.0.0.1`) | R1 |
| Queues UI | Bull Board за admin-guard; local — `127.0.0.1`, hosted — тільки Tailscale | R1 |
| Traces | OpenTelemetry: HTTP → Prisma (`@prisma/instrumentation`) → BullMQ (`traceparent` у job data) → worker; OTel Collector → Grafana Tempo (retention 3 дні), sampling 10% + всі помилки | R2 |
| Logs aggregation | Grafana Loki | Later |

## 10. Метрики (P-17)

- `prom-client` експонує `/metrics` на **внутрішніх портах**: api `:9464`, worker `:9465` — мережа `internal`; safe-fetcher `:9466` — мережа `fetch-rpc` (Prometheus приєднаний до неї тільки для scrape; safe-fetcher у `internal` не входить, §3.2).
- Exporters: `node_exporter` (+ textfile collector для бекапів), `postgres_exporter` (роль `metrics`), `redis_exporter`. Prometheus scrape 15 с, retention 30 днів.
- Labels без `userId`, email, raw path — тільки route templates і обмежені enum-и.

| Метрика | Тип | Labels | Реліз |
|---|---|---|---|
| `http_server_request_duration_seconds` | histogram (buckets 0.025…5) | `method`, `route` (template), `status_class` | R1 |
| `bullmq_queue_jobs` | gauge | `queue`, `state` (waiting, active, delayed, failed, completed) | R1 |
| `bullmq_job_duration_seconds` | histogram | `queue`, `name`, `result` | R1 |
| `outbox_lag_seconds` | gauge (вік найстарішої неопублікованої події) | — | R1 |
| `outbox_events_pending` | gauge | `type` | R1 |
| `outbox_dead_events` | gauge (`attempts = maxAttempts`, не опубліковані) | `type` | R1 |
| `ai_tokens_total` | counter | `task`, `model`, `kind` (input, output) | R1 |
| `ai_cost_usd_total` | counter | `task`, `model` | R1 |
| `ai_runs_total` | counter | `task`, `status` (ok, cached, invalid_output, error, budget_exceeded, disabled) | R1 |
| `ai_latency_seconds` | histogram | `task` | R1 |
| `ai_budget_rejections_total` / `ai_cache_hits_total` | counter | `scope` | R1 |
| `capture_fetch_total` | counter | `result` (ok, blocked_ssrf, timeout, too_large, bad_content_type, http_error, robots_denied, domain_policy) | R1 |
| `ingestion_last_success_timestamp_seconds` | gauge | `source` | R2 |
| `ingestion_items_total` | counter | `source`, `result` (new, updated, duplicate, invalid) | R2 |
| `reminder_delivery_lag_seconds` | histogram (`deliveredAt − dueAt`) | `channel` | R1 |
| `auth_failures_total` | counter | `reason` (invalid_credentials, rate_limited, origin_rejected, fresh_session_required) | R1 |
| `rate_limit_hits_total` | counter | `limiter` (auth, capture, import, demo, ai) | R1 |
| `backup_last_success_timestamp_seconds` | gauge (textfile) | `kind` (pg_dump, wal_g_base) | R1 |
| `wal_g_archive_lag_seconds` | gauge (textfile) | — | R1 |
| `worker_heartbeat_timestamp_seconds` | gauge | `process` | R1 |
| Default Node.js | `collectDefaultMetrics` (event loop lag, heap, GC) | `process` | R1 |

## 11. Dashboards, alerts, routing (as code)

| Артефакт | Шлях |
|---|---|
| Prometheus config | `infra/observability/prometheus/prometheus.yml` |
| Alert rules | `infra/observability/prometheus/rules/*.yml` + unit-тести `rules/tests/*.test.yml` (`promtool check rules` і `promtool test rules` у CI) |
| Alertmanager | `infra/observability/alertmanager/alertmanager.yml` |
| Grafana provisioning | `infra/observability/grafana/provisioning/{datasources,dashboards}/*.yml` |
| Dashboards (JSON) | `infra/observability/grafana/dashboards/{api,queues-outbox,ai-cost,capture-ingestion,postgres-redis,host}.json` |

Ручні зміни в Grafana UI не зберігаються (provisioning read-only) — зміна = PR.

**Alert rules [R1]:**

| Alert | Умова | Severity |
|---|---|---|
| `ApiDown` | `up{job="api"} == 0` 2 хв | critical |
| `WorkerStalled` | `time() - worker_heartbeat_timestamp_seconds > 120` | critical |
| `HighErrorRate` | 5xx > 2% запитів 10 хв | critical |
| `ReadLatencyHigh` | p95 read routes > 300 ms 15 хв | warning |
| `QueueFailedJobs` | `increase(bullmq_queue_jobs{state="failed"}[15m]) > 5` | warning |
| `QueueBacklog` | waiting > 500 протягом 10 хв | warning |
| `OutboxLagHigh` | `outbox_lag_seconds > 60` 5 хв | warning |
| `OutboxDeadEvents` | `outbox_dead_events > 0` | warning |
| `ReminderDeliveryLag` | p95 `reminder_delivery_lag_seconds` > 120 с 15 хв | warning |
| `AiCostBudget` | денна вартість > 80% глобального cap | warning; > 100% — critical |
| `SsrfBlocksSpike` | `increase(capture_fetch_total{result="blocked_ssrf"}[1h]) > 20` | info |
| `AuthFailuresSpike` | `increase(auth_failures_total[10m]) > 50` або rate-limit hits auth > 20/10 хв | warning |
| `IngestionStale` (R2) | `time() - ingestion_last_success_timestamp_seconds > 2 × interval` | warning |
| `BackupStale` | pg_dump/base backup старший за 26 год або `wal_g_archive_lag_seconds > 900` | critical |
| `RestoreTestStale` | останній успішний restore test старший за 35 днів | warning |
| `DiskUsageHigh` | вільно < 20% на root/volume | warning; < 10% — critical |
| `PostgresConnectionsHigh` | > 80% `max_connections` | warning |

**Routing (Alertmanager):** critical → Telegram-бот (окремий alerts-чат) + email, `repeat_interval 1h`; warning → Telegram, `repeat_interval 4h`; info → тільки Telegram без повторів. Тихі години не застосовуються до critical. Sentry-alerts (нова помилка, spike) — email + Telegram через Sentry integration. Local (R1): rules і routing перевіряються `promtool` у CI; Alertmanager-receivers без секретів не надсилають нічого (ADR 022). When hosting (і до Prometheus на хості): uptime-check `/health/ready` (зовнішній безкоштовний монітор) + Sentry + cron, що шле в Telegram результат nightly `pg_dump`. Alerts `BackupStale`, `RestoreTestStale`, `DiskUsageHigh`, `ApiDown` мають сенс лише when hosting.

## 12. NFR-цілі

| NFR | Ціль | Вимірювання |
|---|---|---|
| p95 read API (list/detail/Today) | ≤ 300 ms | Prometheus histogram; k6 nightly (`11-testing.md` §7) |
| p95 search (`/jobs?q=`) | ≤ 600 ms | те саме |
| p95 transition (mutation) | ≤ 400 ms | те саме |
| LCP Dashboard / Applications | ≤ 2 s (desktop, cold cache; when hosting — staging/prod, до того — орієнтир у CI) | Lighthouse CI |
| Error rate (5xx) | < 1% за 1 год | Prometheus |
| Доступність (prod) | ≥ 99.5% / міс — тільки when hosting | uptime-check |
| Reminder delivery lag | p95 ≤ 60 s | `reminder_delivery_lag_seconds` |
| Capture (URL → draft, без LLM) | p95 ≤ 6 s (API чекає job ≤ 6 с, далі `504 CAPTURE_TIMEOUT`, ADR 021) | `bullmq_job_duration_seconds{queue="capture"}` |
| Outbox lag | p95 ≤ 5 s | `outbox_lag_seconds` |
| RPO / RTO | local: частота `pg_dump`-скрипта / ручний restore; when hosting: 24 год / 4 год, з WAL-G — 5 хв / 2 год | §5 restore test |
| Account deletion | ≤ 24 год | job duration + e2e (`11-testing.md` §6) |

Обсяг, на якому діють цілі: ≤ 50 активних користувачів, ≤ 5 000 applications і ≤ 100 000 jobs на інстанс.

## Зміни відносно v2.0

- Рішення 3 / I-01 — VPS Hetzner + Compose + Caddy + Terraform (VPS, DNS, R2) замість вибору VPS/AWS; оцінка вартості.
- Рішення 4 — домени `app.`/`api.` same-site; SPA на Cloudflare Pages з custom domain `app.<domain>` (fallback — Caddy); staging на окремому registrable domain.
- Рішення 5 — PostgreSQL 18, нативний `uuidv7()`, ролі БД `applyra_app` / `applyra_maintenance`.
- A-03 — у R0 немає worker-контейнера (Today/Overdue при читанні); worker з R1.
- Рішення 6 / P-17 — Prometheus + Grafana у R1, метрики через `prom-client` на внутрішніх портах, exporters, dashboards і alert rules as code, routing у Telegram/email; OTel traces — R2.
- I-02 / P-23 — nightly `pg_dump` уже в R0; WAL-G у R2-сховище, шифрування, 14 днів, RPO/RTO, щомісячний scripted restore test.
- I-03 — expand/contract, squawk у CI, `lock_timeout`, міграції як one-off job до rollout api.
- I-04 — staging тільки з synthetic data, окремі OAuth/LLM-ключі й buckets на середовище.
- S-01/S-19 — ізольована egress-мережа для safe-fetcher, внутрішні UI тільки через Tailscale.
- Нове — таблиця середовищ, CI/CD workflows і стадії deploy по релізах, розширені NFR.
- ADR 022 (2026-11-16) — portfolio mode: у R0/R1 нічого не хоститься (D-01 superseded); local/Codespaces — основне середовище, demo sign-in без Google; images (multi-arch), `compose.prod.yml`, Terraform і `deploy-prod.yml` (dispatch-only) перевіряються в CI; бекапи R2, WAL-G, restore test, uptime, staging і release flow — «when hosting»; §2.1 — безкоштовні/дешеві варіанти хостингу. Workflow R0 уніфіковано як `deploy-prod.yml` (раніше §8.1 — `deploy-staging.yml`).
