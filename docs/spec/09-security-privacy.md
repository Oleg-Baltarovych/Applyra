# Безпека та приватність

> Applyra spec v2.1 · Зона: threat model, security controls, приватність і retention · Пов'язані: `02-releases.md`, `03-functional.md`, `04-architecture.md`, `05-data-model.md`, `06-api.md`, `07-ai.md`, `08-ingestion-matching.md`, `11-testing.md`, `12-infra-ops.md`

Теги релізу: **[R0]** … **[R3]** — реліз, у якому контроль має бути реалізований і покритий тестом (див. `02-releases.md`). Контроль без тегу діє з R0.

## 1. Threat model (summary)

### 1.1. Активи

| Актив | Чутливість | Де живе |
|---|---|---|
| CV / документи (PDF/DOCX + `parsedText`) | висока (PII, історія роботи) | S3 (R2), Postgres `DocumentVersion` |
| Applications, notes, timeline, зарплатні очікування | висока (комерційно чутливо для користувача) | Postgres |
| Контакти рекрутерів (персональні дані третіх осіб) | висока | Postgres `Contact` |
| Сесії, OAuth-акаунти, Telegram chat id | висока | Postgres (Better Auth tables), Redis (rate limits) |
| AI-бюджет, ключі провайдерів, секрети | середня–висока (гроші) | env / GitHub Environments |
| Доступність сервісу | середня | VPS |

### 1.2. Актори

| Актор | Можливості |
|---|---|
| Анонімний відвідувач | публічні сторінки, sign-in, «Try demo» |
| Demo-користувач | ефемерний акаунт з обмеженнями (§11) |
| Автентифікований користувач (зловмисний) | валідна сесія, підбирає чужі id, шле шкідливі URL/файли/CSV |
| Сторонній контент | HTML вакансій, тексти рекрутерів, відповіді джерел ingestion — може містити XSS / prompt injection |
| Атакувальник supply chain | шкідливий npm-пакет, compromised GitHub Action |
| Адмін (автор) | `role = ADMIN`, доступ до Bull Board / Grafana (§13) |

### 1.3. Топ-загрози

| # | Загроза | Контроль | Тест |
|---|---|---|---|
| T1 | BOLA/IDOR — читання чужих заявок, CV | §2 | IDOR suite (`11-testing.md` §4) |
| T2 | SSRF через URL capture → metadata, Postgres, Redis | §5 | SSRF fixtures (`11-testing.md` §5) |
| T3 | Шкідливий документ (zip bomb, XXE, CVE pdfjs) | §6 | upload fixtures |
| T4 | Stored XSS через HTML вакансії / нотатки | §7, §9 | sanitizer tests + CSP header test |
| T5 | CSRF / session hijacking | §3, §4 | auth integration tests |
| T6 | Account takeover (credential stuffing, linking) | §4 | auth integration tests |
| T7 | Витік PII через логи, Sentry, бекапи, LLM | §10, §12 | redaction unit test |
| T8 | Зловживання demo (AI-бюджет, спам, XSS між відвідувачами) | §11 | demo integration tests |
| T9 | Supply chain / витік CI-секретів | §14 | CI policy checks |
| T10 | Prompt injection з вакансій/повідомлень | див. `07-ai.md` (розділ «Prompt injection») | AI contract tests |

## 2. Authorization та IDOR

- Кожен приватний endpoint — за глобальним auth guard; публічні маркуються явно `@Public()`. Неавторизований запит → 401.
- Доступ до user-owned даних — **тільки** через `findOwned*` / `listOwned*` хелпери репозиторіїв (`where: { id, userId }`).
- Чужий або неіснуючий ресурс → **404 `NOT_FOUND`**, ніколи 403 (не розкриваємо факт існування). Роль без доступу (admin-routes) → теж 404. 403 — тільки `CSRF_ORIGIN`, `FRESH_SESSION_REQUIRED`, `DEMO_FEATURE_DISABLED`, `SIGNUP_CLOSED` (лише прямий API sign-up; OAuth callback — redirect `?error=SIGNUP_CLOSED`) (каталог — `06-api.md` §3.1).
- **Job access predicate** (A-09) — єдиний helper `canAccessJob(user, job)`:
  `job.visibility = 'PUBLIC'` **або** `job.ownerId = user.id`. Приватна чужа вакансія → 404. Мутації `Job` — тільки власник (catalog jobs — тільки ingestion/admin).
- Вхідні схеми (Zod, `.strict()`) не містять `userId`, `ownerId`, `role`, `deletedAt` — mass assignment неможливий. Відповіді проходять response-схему (`@ZodResponse`) — зайві поля відрізаються.
- Prisma Client Extension у dev/test: warning (у тестах — fail) на запит до user-scoped моделі без `userId` у `where`.
- UUID v7 id не вважаються секретом.
- IDOR suite генерується з таблиці routes (T-02) — див. `11-testing.md` §4.

## 3. Домени, cookies, CSRF, CORS (S-04, рішення 4)

| Контроль | Значення |
|---|---|
| Домени | SPA `https://app.<domain>`, API `https://api.<domain>` — same-site (див. `12-infra-ops.md` §3). Staging (опційно, when hosting; тільки synthetic) — окремий registrable domain. У R0/R1 hosted-середовищ немає (ADR 022, `12-infra-ops.md` §1) |
| Session cookie | `__Host-applyra.session` (Better Auth `advanced.cookies.session_token.name`; `useSecureCookies: false`, інакше `__Secure-__Host-…`; `Secure` через `defaultCookieAttributes` — і на `http://localhost`: Chrome/Firefox так, Safari ні), `HttpOnly; Secure; SameSite=Lax; Path=/`, без `Domain` |
| Інші cookies | тільки Better Auth (state/PKCE для OAuth), `advanced.cookiePrefix: "__Host-applyra"` → `__Host-applyra.state` |
| Origin check | Better Auth `trustedOrigins = [APP_ORIGIN]` для `/api/auth/*`; власний `OriginGuard` для решти мутацій: `POST/PUT/PATCH/DELETE` без `Origin` або з `Origin ∉ allowlist` → 403 `CSRF_ORIGIN` |
| Content-Type | мутації приймають тільки `application/json` → інакше 415. Виняток — явний `@AcceptsMultipart()` (CSV import), Origin check однаково діє |
| CORS | `Access-Control-Allow-Origin: https://app.<domain>` (точний збіг, без wildcard), `Allow-Credentials: true`, `Allow-Methods: GET,POST,PUT,PATCH,DELETE`, `Allow-Headers: Content-Type, Idempotency-Key`, `Max-Age: 600` |
| GET безпечні | GET ніколи не змінює стан (lint-правило на контролерах) |

## 4. Автентифікація та сесії (S-05, S-06, S-07)

### 4.1. Методи

| Метод | Реліз |
|---|---|
| Google OAuth (OIDC, PKCE) — provider реєструється лише при заданих `GOOGLE_CLIENT_ID/SECRET` | [R0] |
| Demo sign-in (`POST /demo/session`, FR-DEMO-01) — вхід без Google для local/Codespaces за `DEMO_ENABLED`; на публічному хості — тільки з контролями §11 | [R0] (anti-abuse — [R1]) |
| Sign-up allowlist (`AUTH_SIGNUP_ALLOWLIST` — список email; решта: Google OAuth → redirect на `errorCallbackURL` = `${WEB_ORIGIN}/sign-in` (абсолютний) з `?error=SIGNUP_CLOSED`, прямий API sign-up (email, R1) → 403 `SIGNUP_CLOSED`). `callbackURL`/`errorCallbackURL` Better Auth перевіряє проти `trustedOrigins` (без open redirect) | [R0] |
| Email + password, email verification, reset password | [R1] |
| Invite-only / публічна реєстрація | [R1] — див. `02-releases.md` |
| TOTP (Better Auth `twoFactor`) — обов'язковий для `ADMIN` | [R1] |

### 4.2. Сесії

| Параметр | Значення |
|---|---|
| Idle TTL | 7 днів (Better Auth `session.expiresIn = 7d`, sliding) |
| Absolute TTL | 30 днів від `session.createdAt` — перевірка в auth guard, далі re-login |
| Rotation | токен оновлюється не частіше 1/добу (`updateAge = 1d`) і завжди після sign-in, зміни пароля, підвищення привілеїв (TOTP) |
| Fresh session | `freshAge = 10 хв`: delete account, data export, зміна email/пароля, unlink Google, вимкнення TOTP — інакше 403 `FRESH_SESSION_REQUIRED` → UI просить re-auth |
| Revoke | зміна/reset пароля → `revokeOtherSessions`; «Sign out everywhere» у Settings; видалення акаунта → всі сесії |
| OAuth-токени | `account.encryptOAuthTokens: true` (M0-10): ключ виводиться з `BETTER_AUTH_SECRET` — ротація секрету інвалідує і сесії, і збережені OAuth-токени |

### 4.2a. Rate limit і client IP [R0, M0-10]

- `/api/auth/*`: `sign-in/social` 10/хв на IP, `callback/*` 20/хв, решта 100/хв; лічильники в Redis (`auth:rl:<ip>|<path>`, 429 + `X-Retry-After`). Redis недоступний → **fail-open** + warn (R0, лише Google); парольні маршрути R1 — **fail-closed**.
- IP = Express `req.ip`: адреса сокета або запис `X-Forwarded-For`, доданий довіреним проксі (`TRUST_PROXY_HOPS`, 0 локально; за Caddy — 1, M0-14). `platform/http` перезаписує `x-applyra-client-ip` (клієнтське значення відкидається), Better Auth читає лише його (`advanced.ipAddress.ipAddressHeaders`) — клієнт не може обрати собі bucket.
- Усі мутації `/api/auth/*` вимагають `Origin = WEB_ORIGIN` (403 `CSRF_ORIGIN`, наш middleware): Better Auth сам перевіряє Origin лише за наявності cookie (login CSRF на `sign-in/social`). GET callback не зачіпається.
- Абсолютний TTL 30 д: `databaseHooks.session.update.before` обрізає `expiresAt` до `createdAt + 30 д` (Better Auth сам перестає визнавати сесію, і `get-session` теж) + Nest `SessionLifetimeGuard` як defence in depth.

### 4.3. Паролі та enumeration [R1]

- Довжина 12–128, без правил складу; перевірка HIBP (k-anonymity, Better Auth `haveIBeenPwned`) на sign-up і зміні.
- Хешування — дефолт Better Auth (scrypt); жодної власної криптографії.
- Enumeration-safe: sign-in → завжди `INVALID_CREDENTIALS`; sign-up і reset → однакова відповідь «якщо акаунт існує, ми надіслали лист»; час відповіді вирівнюється (dummy-hash).
- Rate limit (Redis): sign-in 5/хв на (IP, email) і 30/год на IP; reset 3/год на email; sign-up 10/год на IP; перевищення → 429 + `auth_failures_total`/`rate_limit_hits_total` (див. `12-infra-ops.md` §10).

### 4.4. Google account linking (S-07)

Better Auth `accountLinking: { enabled: true, trustedProviders: [] }`. Linking Google до наявного email-акаунта — тільки якщо `email_verified = true` у Google ID token **і** локальний email підтверджений. Інакше → 409 `ACCOUNT_LINK_REQUIRES_VERIFICATION` (увійти паролем і прив'язати з Settings). На OAuth callback це redirect з кодом Better Auth `?error=account_not_linked` (M0-10, `accountLinking: { enabled: true, trustedProviders: [], allowDifferentEmails: false }`); SPA показує його як `ACCOUNT_LINK_REQUIRES_VERIFICATION`.

## 5. URL capture — SSRF (S-01, S-02, S-03) [R1]

URL capture переїхав у R1 (див. `02-releases.md`). Fetcher — окремий контейнер `safe-fetcher` (див. `08-ingestion-matching.md` для парсингу).

| Контроль | Правило |
|---|---|
| Парсинг URL | WHATWG `URL`; тільки `http:`/`https:`; порт 80/443 (явний інший → reject); без userinfo (`user:pass@`) |
| IP-літерали | нормалізуються `ipaddr.js` (`ipaddr.parse`, включно з decimal `2130706433`, octal `0177.0.0.1`, hex `0x7f.1`, короткі форми `127.1`) до перевірки |
| Allow-only | дозволено тільки `range() === 'unicast'` (IPv4) / `'unicast'` (IPv6). IPv4-mapped IPv6 (`::ffff:a.b.c.d`) → розпакувати `toIPv4Address()` і перевірити як IPv4 |
| Заблоковано явно (тест-фікстури) | `0.0.0.0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16` (metadata), `172.16/12`, `192.168/16`, `192.0.0/24`, `198.18/15`, multicast/reserved; `::/128`, `::1`, `fc00::/7`, `fe80::/10`, `64:ff9b::/96` і `64:ff9b:1::/48` (NAT64), `2002::/16` (6to4), `2001::/32` (Teredo) |
| DNS rebinding | DNS резолвиться **один раз**; з'єднання — з уже перевіреним IP через custom `lookup` в undici `Agent({ connect: { lookup } })`; `servername`/`Host` = оригінальне ім'я. Якщо будь-яка A/AAAA-адреса заблокована → reject |
| Redirects | `redirect: 'manual'`, ≤ 3; на кожному кроці заново: scheme, порт, DNS + IP-перевірка; заборона `https → http` downgrade |
| Розмір | ≤ 2 MB **після** розпакування (лічильник на decoded stream, abort при перевищенні); `Content-Length` > 2 MB → reject одразу |
| Тип | тільки `text/html` / `application/xhtml+xml` |
| Час | connect 3 с, total 5 с |
| Запит | без cookies, без auth, ідентифікований `User-Agent: ApplyraBot/<version> (+https://app.<domain>/bot)` |
| Rate limit | 30/год на користувача, 5 паралельних глобально |
| Політика доменів | LinkedIn — тільки paste; решта — за robots/ToS (P-18, див. `08-ingestion-matching.md`) |
| Мережева ізоляція | `safe-fetcher` у мережі `egress` (тільки інтернет) + `fetch-rpc` (RPC тільки з worker; API в цій мережі немає — capture іде через чергу `capture`, ADR 021; Prometheus — лише scrape `:9466`); не бачить `postgres`/`redis`/`minio` (не резолвляться); без DB/Redis credentials. Host firewall (`DOCKER-USER`) дропає трафік з `egress` subnet до RFC 1918, `100.64/10`, `169.254/16` (див. `12-infra-ops.md` §3) |
| Результат | метрика `capture_fetch_total{result}` включно з `blocked_ssrf` |

## 6. Документи та uploads (S-08) [R1]

| Крок | Контроль |
|---|---|
| 1. Init | `POST /documents/uploads` → `DocumentVersion(status=PENDING)`, key `quarantine/<userId>/<uuid>`; **presigned PUT** (рішення: Cloudflare R2 не підтримує presigned POST policy) з підписаними `Content-Length` (= заявлений `sizeBytes`, 1..5 242 880) і `Content-Type ∈ {application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document}`, TTL 5 хв. Запит з іншим розміром/типом storage відхиляє (підпис не збігається) |
| 2. Confirm | `POST /documents/uploads/:versionId/complete` → `HEAD` (розмір = заявлений, ≤ 5 MB) → outbox `DocumentUploaded` → job `documents/validate` (кроки 3–5, `04-architecture.md` §5.4) |
| 3. Validate | magic bytes (`file-type`) збігаються з MIME; DOCX без макросів (`.docm` content types → reject); зашифровані PDF → reject |
| 4. Parse (sandbox) | child process (`fork`, `--max-old-space-size=256`), timeout 20 с → SIGKILL; без мережі й credentials (env очищений). DOCX: ≤ 1 000 zip entries, decompressed ≤ 50 MB, ratio ≤ 100, XML без DTD/external entities. PDF: pdfjs `isEvalSupported: false`, `disableFontFace: true`, ≤ 50 сторінок. `parsedText` ≤ 200 000 символів |
| 5. Promote | успіх → copy у `documents/<userId>/<uuid>`, delete quarantine, `DocumentVersion.status=READY`; невдача → `status=REJECTED` + delete object |
| Download | тільки `READY`, signed GET ≤ 5 хв, `Content-Disposition: attachment`, `filename` генерується з санітизованого імені |
| Lifecycle | quarantine prefix — S3 lifecycle expire 1 день |
| Malware scan | ClamAV — R1 Could |

Ліміти імпорту CSV: ≤ 1 MB, ≤ 5 000 рядків [R0].

## 7. Untrusted HTML (S-09)

- Санітизація **на запис** (`sanitize-html`), у БД зберігається тільки sanitized HTML; frontend рендерить тільки через `SafeHtml` (див. `10-frontend-ux.md` §9).
- Allowlist: теги `p br ul ol li strong b em i u h2 h3 h4 blockquote code pre a hr table thead tbody tr th td`; атрибути — тільки `a[href]`; schemes `http https mailto`; `transformTags.a` форсує `rel="noopener noreferrer nofollow ugc" target="_blank"`. Заборонено: `img` (жодних remote images — AI-01), `style`, `class`, `id`, `on*`, `iframe`, `form`, `svg`. `disallowedTagsMode: 'discard'`. Вихід ≤ 100 KB.
- Notes і поля користувача — plain text (markdown не рендериться як HTML у R0–R1).
- AI-вивід — тільки через схему, без HTML/URL-полів, де вони не потрібні (див. `07-ai.md`).

## 8. CSV export / import (S-10)

- Formula injection: клітинка, що починається з `=`, `+`, `-`, `@`, `\t`, `\r` (а також fullwidth `＝ ＋ － ＠`), отримує префікс `'`. Застосовується до всіх string-полів експорту [R0].
- Quoting за RFC 4180; кодування UTF-8 з BOM (Excel).
- Import: ліміти §6; значення ніколи не виконуються, тільки мапляться (див. `03-functional.md` FR-IMP).

## 9. Security headers і CSP (S-11)

### 9.1. SPA (`app.<domain>`, Cloudflare Pages `_headers`; fallback — Caddy)

| Header | Значення |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' {$API_ORIGIN} https://*.ingest.de.sentry.io; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; report-to csp-endpoint` (`report-to` — [R1, з Sentry web]) |
| `Reporting-Endpoints` | `csp-endpoint="<Sentry CSP report URL>"` [R1, з Sentry web: порожній endpoint — невалідний header] |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (preload — після 1 міс стабільної роботи) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `X-Frame-Options` | `DENY` (legacy-дубль `frame-ancestors`) |
| Cache | `index.html` → `no-cache`; `/assets/*` (hashed) → `public, max-age=31536000, immutable` |

Джерело — `apps/web/public/_headers` (плейсхолдер `{$API_ORIGIN}` = `https://api.<domain>`, синтаксис env Caddy); `scripts/headers.mjs` `renderHeaders` підставляє його при deploy; Caddy-сніпет `(spa_headers)` у `infra/caddy/Caddyfile` ідентичний (`test/security-headers.test.ts`), runtime — `infra/compose/smoke.sh` (M0-14).

`script-src` без `'unsafe-inline'`/`'unsafe-eval'`: жодних inline-скриптів у `index.html` (див. `10-frontend-ux.md` §9). **Рішення:** `style-src 'self' 'unsafe-inline'` прийнято (runtime-стилі Radix/sonner); `script-src` лишається strict. Turnstile-хости потрібні тільки для demo (§11).

### 9.2. API (`api.<domain>`, Nest + helmet)

`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` · `Cache-Control: no-store` на всіх приватних відповідях · HSTS, `nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site` · без `X-Powered-By` · помилки без stack trace (формат — `06-api.md`). Тіло: JSON-only, 1 MB (`06-api.md` §5); Better Auth читає тіла `/api/auth/*` без ліміту, тому власний middleware на цьому префіксі: `Content-Length` > 1 MB → 413, нечисловий → 400, chunked — байти рахуються на потоці, понад 1 MB → 413 і з'єднання закривається (форма помилки — `06-api.md` §3, не Better Auth).

Тест: точні значення headers — integration + nightly проти `compose.ci.yml`; nightly на hosted-середовищі — when hosting (див. `11-testing.md` §5).

## 10. Логи та redaction

pino `redact` (censor `[REDACTED]`), єдиний список у `apps/api/src/platform/logging/redact.ts`, покритий unit-тестом. Ключі ловляться на глибині 0–2 (`k`, `*.k`, `*.*.k` — pino-шляхи не рекурсивні), тому логуються лише пласкі контекстні об'єкти; request-логи містять тільки `method`, `path` (без query), `statusCode`, `requestId` — без headers і тіл (M0-09):

| Категорія | Шляхи |
|---|---|
| Секрети | `password`, `newPassword`, `currentPassword`, `token`, `accessToken`, `refreshToken`, `idToken`, `secret`, `totp`; OAuth `code` — лише `body.code`, `query.code`, `oauth.code` (не поле помилки: `errorCode`/`err.code` лишаються) |
| Headers | `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, `x-api-key` |
| Контент користувача | `parsedText`, `notes`, `note`, `description`, `coverLetter`, `body.message`, `body.text` (`message` — контент користувача лише в тілі запиту; `err.message` лишається, email-подібні підрядки в серіалізованій помилці маскуються), промпти й AI-виводи (ніколи не логуються) |
| PII | `email` → маска `o***@domain`; `phone`; `contact.*`; `telegramChatId`; IP → обрізаний /24 (/48 IPv6) |
| URL | query-string presigned URLs (`X-Amz-*`) обрізається |

Шифрування на рівні застосунку: Telegram chat id, токени інтеграцій — AES-256-GCM, ключ `APP_ENCRYPTION_KEY` з key id (ротація без перешифрування старих записів одразу).

## 11. Demo-режим (S-15, рішення 7) [R0 local / R1]

**R0 (ADR 022):** «Try demo» — вхід без Google для local/Codespaces; діють рядки «Модель», «Ізоляція», «Сесія»; решта — R1. Увімкнення — `DEMO_ENABLED` (env schema): `true` у `.env.example`, у `NODE_ENV=production` дозволено лише з налаштованим Turnstile (R1), інакше процес не стартує — demo без anti-abuse не може потрапити на публічний хост. Demo-сесія не обходить allowlist для реальних акаунтів: створюється лише demo-`User` з `demoExpiresAt`, без `Account`. У R0 немає uploads/capture/email, тож список «Вимкнено» поки нічого не блокує; purge — R1 (локально demo-користувачі накопичуються до M5-13).

| Контроль | Правило |
|---|---|
| Модель | «Try demo» створює ефемерного `User` (`role = USER`, `demoExpiresAt = now + 24 год`; demo ⇔ `demoExpiresAt IS NOT NULL`) із синтетичним seed; у кожного відвідувача свої дані |
| TTL | 24 год від створення → hard-delete job (той самий pipeline, що delete account) |
| Anti-abuse | Cloudflare Turnstile (server-side verify) перед створенням; ≤ 3 demo/добу на IP; глобально ≤ 200 активних demo |
| Вимкнено | uploads, URL capture, email/Telegram, зміна email/пароля, linking, export з файлами, invite |
| AI | stub-provider за замовчуванням; якщо увімкнено — ≤ 5 запусків на demo-користувача і глобальний денний cap у USD (див. `07-ai.md`) |
| Ізоляція | той самий authZ, що й для реальних; demo не бачить жодних не-demo даних |
| Сесія | TTL сесії = TTL користувача |

## 12. Приватність, сховища і retention (S-12, S-13)

### 12.1. Сховища даних

| Сховище | Дані | Retention | Метод видалення | Покрито delete account |
|---|---|---|---|---|
| Postgres | усі доменні дані користувача | до видалення | soft delete (`deletedAt`) → hard-delete job ≤ 24 год; FK `Cascade` (див. `05-data-model.md`) | так |
| S3 documents | CV-файли, усі `DocumentVersion` | до видалення | `DeleteObjects` за prefix `documents/<userId>/` + `quarantine/<userId>/`, включно з noncurrent versions, якщо bucket versioning увімкнено | так |
| S3 exports | `DataExport` zip | посилання й об'єкт 24 год (`DataExport.expiresAt`, видаляє застосунок); bucket lifecycle 48 год — страховка | cleanup при `expiresAt` + явне видалення в delete pipeline; lifecycle — backstop | так |
| Redis / BullMQ | job payloads (тільки id, без PII), rate-limit лічильники | completed 24 год, failed 7 днів | `removeOnComplete/Fail` за віком; ключі `*:<userId>` видаляються pipeline | так |
| Backups (local `pg_dump` автора; when hosting — WAL-G, pg_dump у R2) | повна копія БД | 14 днів / 14 файлів, далі expire (lifecycle / ротація скрипта) | автоматичне закінчення; після restore — повторне застосування tombstones | ні — зникає ≤ 14 днів (зазначено в privacy policy) |
| Логи (docker json-file) | метадані запитів, redacted | 14 днів (ротація) | ротація | ні — тільки userId, без контенту |
| Sentry | помилки, `user.id` без email/IP (`sendDefaultPii: false` — у SDK 11 `dataCollection` вимкнено; `beforeSend` scrub) | 30 днів | retention Sentry; за запитом — delete by user id | частково (ручний запит) |
| `AiRun`, `AiUsageDaily` | task, model, tokens, cost, input hash (без сирого тексту) | 90 днів | cron + Cascade | так |
| LLM provider | промпти/виводи під час виклику | залежить від вибору провайдера, вирішується в M4 (no-training API; zero/обмежена retention — follow-up ADR 017) | не контролюється — мінімізація контексту (`07-ai.md`) | ні (зазначено) |
| Email provider | адреса + тема листа | за політикою провайдера | — | ні (зазначено) |
| `AuditLog` | події §13 | 90 днів | cron; при delete account `userId → NULL`, IP анонімізується | анонімізується |

**Tombstones:** `DeletedUserTombstone` (тільки `id` + `deletedAt`, `05-data-model.md`) зберігається 30 днів; restore-процедура після відновлення бекапу повторно видаляє цих користувачів (див. `12-infra-ops.md` §5).

### 12.2. Правова основа і контакти рекрутерів

| Дані | Основа (GDPR Art. 6) | Мінімізація |
|---|---|---|
| Дані користувача | 6(1)(b) — виконання договору (сервіс) | тільки потрібні поля |
| Контакти рекрутерів (третіх осіб) | 6(1)(f) — законний інтерес користувача вести свій пошук | ім'я, роль, компанія, робочий email/LinkedIn URL, нотатки; без спецкатегорій; видаляються разом із заявкою/акаунтом; користувач може видалити контакт будь-коли |

- Контакти **ніколи не потрапляють в AI-контекст** (без opt-in; див. `07-ai.md` §5).
- Privacy policy (коротка, чесна, з таблицею §12.1) — до відкриття реєстрації для інших людей [R1].
- Export (FR-PRIV) включає контакти, бо їх ввів користувач.

## 13. Audit log та адміністрування (S-14, S-19) [R1]

**AuditLog** — append-only: runtime-роль `applyra_app` має тільки `INSERT`/`SELECT`; retention і анонімізацію виконує `applyra_maintenance` (`05-data-model.md` §7.5, `12-infra-ops.md` §4). Retention 90 днів.

Назви = значення enum `AuditAction` (`05-data-model.md` §4.1), цей перелік — джерело.

| Подія (`AuditAction`) | Деталі |
|---|---|
| `SIGN_IN_SUCCEEDED` / `SIGN_IN_FAILED` | метод, IP (/24), user agent |
| `SIGN_OUT`, `SESSION_REVOKED`, `SESSIONS_REVOKED` (усі) | |
| `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED` | |
| `ACCOUNT_LINKED` / `ACCOUNT_UNLINKED`, `EMAIL_CHANGED`, `TOTP_ENABLED` / `TOTP_DISABLED` | |
| `DATA_EXPORT_REQUESTED` / `DATA_EXPORT_DOWNLOADED`, `ACCOUNT_DELETE_REQUESTED` / `ACCOUNT_DELETED` | |
| `DOCUMENT_DOWNLOADED`, `DOCUMENT_DELETED` | documentVersionId |
| `IMPORT_COMMITTED` | кількість рядків |
| `AI_SETTINGS_CHANGED`, `TELEGRAM_CONNECTED` / `TELEGRAM_DISCONNECTED` (R2) | |
| `ADMIN_ACCESS`, `ADMIN_ACTION`, `ROLE_CHANGED` | route, target |
| `DEMO_CREATED` | без IP у явному вигляді |

**Admin (S-19):** `User.role ∈ {USER, ADMIN}` (demo — `USER` з `demoExpiresAt`). Admin-endpoints — `@Roles('ADMIN')` + TOTP + fresh session; не-admin отримує 404. Bull Board, Grafana, Prometheus **не публікуються через Caddy**: доступ тільки через Tailscale (див. `12-infra-ops.md` §3); Bull Board додатково за admin-guard.

## 14. Supply chain і CI-секрети (S-16, S-17)

| Контроль | Правило |
|---|---|
| Renovate | щотижня, grouped; `minimumReleaseAge: 3 days`; оновлює і digests GitHub Actions |
| Аудит залежностей | `pnpm audit --audit-level=high` + `osv-scanner` на PR (fail на high/critical без ignore з датою) |
| SAST | Semgrep CE (open-source CLI, community rulesets, без login, `--metrics=off`; finding → fail) на PR і щотижня; CodeQL (`javascript-typescript`) — коли репо стане публічним (для приватних репо не безкоштовний, ADR 023) |
| Секрети в коді | gitleaks — pre-commit і CI |
| Install scripts | pnpm (версія — `04-architecture.md` §7) блокує lifecycle scripts; allowlist `pnpm.onlyBuiltDependencies` (`prisma`, `@prisma/engines`, `esbuild`, …) у `pnpm-workspace.yaml`; `--frozen-lockfile` |
| Actions | pinned на повний commit SHA (+ коментар з версією); тільки verified/офіційні або перевірені |
| Permissions | top-level `permissions: contents: read`; ширші — per job (`packages: write` для build, `security-events: write` для CodeQL, коли буде доданий — ADR 023) |
| Environments | `production` (required reviewer = автор; `deploy-prod.yml` — dispatch-only до hosting), when hosting — + `staging`, `backup-restore`, тільки теги `v*` для prod при staging-flow; секрети тільки в Environment, не в repo-level; у R0/R1 deploy-секретів немає (ADR 022) |
| OIDC | де провайдер підтримує (Tailscale для deploy-доступу, GHCR через `GITHUB_TOKEN`); інакше короткоживучі scoped токени (R2 token на один bucket) |
| PR з форків | без секретів (`pull_request`, не `pull_request_target`) |
| Images | base images pinned digest; non-root user; `npm`/`pnpm` відсутні в runtime image (distroless, перевірка в CI `deploy-ready`); Dockerfile — hadolint (`--failure-threshold warning`) + Semgrep `p/dockerfile`, `p/docker-compose` (M0-14) |

## 15. OWASP API Security Top 10 (2023) — мапінг

| Ризик | Контроль | Тест (`11-testing.md`) |
|---|---|---|
| API1 Broken Object Level Authorization | §2 `findOwned*`, `canAccessJob`, 404 | генерований IDOR suite (§4) [R0] |
| API2 Broken Authentication | §4 Better Auth, TTL, rotation, rate limits, HIBP, linking rule | auth integration tests [R0/R1] |
| API3 Broken Object Property Level Authorization | `.strict()` input без `userId/role`, response-схеми | contract tests (§5) [R0] |
| API4 Unrestricted Resource Consumption | rate limits, ліміти розмірів (§5, §6, §8), `limit ≤ 100`, AI budgets | limit tests + k6 [R1] |
| API5 Broken Function Level Authorization | global guard, явний `@Public()`, `@Roles('ADMIN')` | route-table test: не-`@Public` без guard → fail; admin routes для USER → 404 [R0] |
| API6 Unrestricted Access to Sensitive Business Flows | sign-up allowlist, Turnstile для demo, capture/import ліміти | rate-limit tests [R1] |
| API7 Server Side Request Forgery | §5 | SSRF fixtures [R1] |
| API8 Security Misconfiguration | §3 CORS, §9 headers, помилки без stack, prod без debug | header tests [R0] |
| API9 Improper Inventory Management | OpenAPI з contracts, `/api/v1`, route table = OpenAPI, staging ізольований | contract test route table ↔ OpenAPI [R1] |
| API10 Unsafe Consumption of APIs | Zod-валідація відповідей джерел ingestion і LLM, timeouts | adapter contract tests на фікстурах [R2]; AI contract tests [R3] |

## Зміни відносно v2.0

- S-01/S-02 — SSRF: перевірений IP через undici `lookup`, `ipaddr.js` allow-only unicast, повний список діапазонів, ізольована egress-мережа.
- S-03 — перевірки на кожному redirect, без https→http, 2 MB після розпакування; capture перенесено в R1.
- S-04 / рішення 4 — `app.`+`api.` same-site, `__Host-` cookies, Origin check, тільки JSON-мутації, CORS allowlist.
- S-05 — idle/absolute TTL, rotation, fresh session ≤ 10 хв, revoke на зміні пароля.
- S-06 — enumeration-safe відповіді, паролі ≥ 12 + HIBP, sign-up allowlist у R0 (R0 — тільки Google, P-10).
- S-07 — linking Google тільки при `email_verified` з обох сторін.
- S-08 — sandbox парсингу, ліміти, presigned PUT з підписаними `Content-Length`/`Content-Type` (R2 без POST policy), карантин (`DocumentVersion.status`).
- S-09 — `sanitize-html` з явним allowlist, без images (AI-01).
- S-10 — захист від CSV formula injection, ліміти імпорту.
- S-11 — точні CSP і security headers для SPA та API; `style-src 'unsafe-inline'` прийнято, скрипти strict.
- S-12/S-13 — таблиця сховищ з retention і методом видалення, tombstones (`DeletedUserTombstone`), правова основа для контактів, контакти поза AI-контекстом.
- S-14 — перелік подій AuditLog, 90 днів, append-only.
- S-15 / рішення 7 — ефемерні demo-користувачі (TTL 24 год, Turnstile, обмеження).
- S-16/S-17 — supply chain і CI-секрети.
- S-19 — `role` (`USER`/`ADMIN`; demo через `demoExpiresAt`), admin + TOTP, внутрішні UI тільки через Tailscale.
- A-09 — Job access predicate для приватних вакансій.
- Нове — мапінг OWASP API Top 10 (2023) і теги релізів на контролях.
- ADR 022 — R0/R1 не hosted: реальні дані третіх осіб не хостяться; demo sign-in у R0 (local) з production-guard на `DEMO_ENABLED`; Google provider опційний; staging/backup-restore Environments — when hosting.
