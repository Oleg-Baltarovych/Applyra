# API

> Applyra spec v2.1 · Зона: HTTP-конвенції, помилки, idempotency, ліміти, каталог endpoints · Пов'язані: `03-functional.md`, `04-architecture.md`, `05-data-model.md`, `07-ai.md`, `09-security-privacy.md`, `11-testing.md`

## 1. Конвенції

| Тема | Правило |
|---|---|
| Base | REST, `https://api.<domain>/api/v1`. Better Auth обслуговує `/api/auth/*`, поза версією |
| Формат | JSON, поля в camelCase, enum-значення в `UPPER_SNAKE` (ті самі, що в `contracts`/Prisma) |
| Дати | ISO 8601 UTC із `Z`. Дати без часу передаються як `YYYY-MM-DD`. Timezone клієнт не надсилає з кожним запитом — береться з `UserSettings.timezone` |
| Гроші | `{ amount: int, currency: "USD", period: "MONTH" }`. Нормалізоване значення є окремим полем `*UsdMonth`, лише для читання |
| Null | Відсутнє значення передається як `null`, а не пропуском поля. `PATCH` змінює лише передані поля, `null` очищає поле |
| Відповіді | Ресурс повертається об'єктом без обгортки. Список має форму `{ items, nextCursor }` |
| Контракти | Zod-схеми в `packages/contracts` + `nestjs-zod`. OpenAPI генерується; `/api/docs` доступний тільки в dev/staging |
| Чужий ресурс | `404 NOT_FOUND`, ніколи не 403 (`09-security-privacy.md`) |
| Заборонено у відповіді | stack traces, SQL, внутрішні hostnames, `storageKey`, хеші |
| CSRF/CORS | Origin-check + CORS allowlist + `__Host-` cookies — див. `09-security-privacy.md` |

## 2. Pagination (A-18)

- Запит: `?limit=` (за замовчуванням 25, **максимум 100**, більше → 400) і `?cursor=` (непрозорий base64url).
- Keyset: курсор кодує `{ sort, dir, v: sortValue, id, fh }`, де `fh` — хеш фільтрів. Порядок завжди `ORDER BY sortValue <dir> NULLS LAST, id <dir>`; `id` (UUID v7) розриває рівність.
- Якщо значення курсора не `NULL`: `(sortValue <op> v) OR (sortValue = v AND id <op> cursorId) OR sortValue IS NULL`. Якщо `NULL`: `sortValue IS NULL AND id <op> cursorId`.
- Сортування `newest`, `updatedAt`, `appliedAt`, `salary` (`salaryMaxUsdMonth`, R2), `match` (`score`, R2) працюють через keyset.
- `relevance` (`ts_rank` при `q`) — **bounded offset**: курсор кодує `offset`, `offset + limit ≤ 500`. Далі `nextCursor = null`, і UI пропонує уточнити запит.
- Курсор з іншими фільтрами чи сортуванням, ніж у запиті (`fh` не збігся) → `400 INVALID_CURSOR`.

## 3. Помилки

```json
{ "statusCode": 409, "code": "CONFLICT_ACTIVE_APPLICATION", "message": "Active application for this job already exists",
  "details": { "existingApplicationId": "0190…" }, "requestId": "0190…" }
```

`details` — масив `[{ path, message }]` для `VALIDATION_ERROR`, для інших кодів — об'єкт. `requestId` збігається із заголовком `X-Request-Id`.

### 3.1. Каталог кодів (A-19)

Каталог є enum `ErrorCode` у `contracts`. Новий код додається спершу сюди, потім у enum.

| HTTP | `code` | Коли |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod-валідація body/query/params |
| 400 | `INVALID_CURSOR` | курсор пошкоджений або не відповідає фільтрам |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | маршрут вимагає `Idempotency-Key`, а заголовка немає |
| 401 | `UNAUTHENTICATED` | немає сесії або сесія недійсна |
| 403 | `FRESH_SESSION_REQUIRED` | сесії більше 10 хв для дії з позначкою `fresh` (§6); UI просить увійти знову |
| 403 | `CSRF_ORIGIN` | мутація без `Origin` або з `Origin` поза allowlist (`09-security-privacy.md` §3) |
| 403 | `DEMO_FEATURE_DISABLED` | функція вимкнена для demo-користувача (FR-DEMO) |
| 403 | `SIGNUP_CLOSED` | email не в allowlist реєстрації — лише прямий API sign-up (`/api/auth/sign-up/email`, R1); Google OAuth callback замість 403 робить redirect на `errorCallbackURL?error=SIGNUP_CLOSED` (§7.1, S-06, FR-AUTH-02) |
| 404 | `NOT_FOUND` | ресурсу немає або він чужий |
| 409 | `CONFLICT_ACTIVE_APPLICATION` | порушено `application_user_job_active_uq` (`05-data-model.md` §6.1); `details.existingApplicationId` — UI пропонує заархівувати стару й повторити |
| 409 | `INVALID_TRANSITION` | `toStatus` = поточний статус або заявка заархівована |
| 409 | `ACCOUNT_LINK_REQUIRES_VERIFICATION` | linking Google без `email_verified` з обох сторін (S-07, FR-AUTH-08) |
| 409 | `CONFLICT_DUPLICATE_JOB` | приватна вакансія з тим самим `canonicalUrl` уже є (`details.existingJobId`) |
| 409 | `CONFLICT_STATE` | недопустима дія в поточному стані (commit простроченого імпорту, delete не останнього `STATUS_CHANGED`, undo після 15 с у R0) |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | паралельний запит з тим самим ключем ще виконується |
| 413 | `PAYLOAD_TOO_LARGE` | понад ліміти §5 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | не той `Content-Type` або MIME/magic bytes файлу |
| 422 | `IDEMPOTENCY_KEY_REUSED` | ключ уже використаний з іншим тілом або маршрутом (S-18) |
| 422 | `CAPTURE_UNAVAILABLE` | сторінку не вдалося отримати (403, CAPTCHA, login wall, SSRF-блок) → «Paste the job text instead» |
| 422 | `IMPORT_INVALID` | CSV не розпарсився (кодування, роздільник, 0 рядків) |
| 422 | `AI_DISABLED` | AI недоступний: `details.reason` = `USER_SETTING` / `GLOBAL_CAP` / `MODE_OFF` (executor, A-15, `07-ai.md` §4.2, §5) |
| 422 | `AI_TASK_UNAVAILABLE` | задача не дозволена для користувача / релізу (`07-ai.md` §5) |
| 422 | `AI_INVALID_OUTPUT` | AI-вивід не пройшов схему після repair-спроби |
| 429 | `RATE_LIMITED` | спрацював throttle §5; заголовок `Retry-After` |
| 429 | `AI_BUDGET_EXCEEDED` | вичерпано денний бюджет користувача (`07-ai.md` §4.1); глобальний cap → `AI_DISABLED` |
| 500 | `INTERNAL_ERROR` | будь-що неочікуване; деталі — тільки в Sentry за `requestId` |
| 502 | `AI_PROVIDER_ERROR` | помилка AI-провайдера після retry |
| 502 | `UPSTREAM_ERROR` | помилка storage чи іншої залежності після retry |
| 504 | `AI_TIMEOUT` | AI-провайдер не відповів за timeout задачі |
| 504 | `CAPTURE_TIMEOUT` | job черги `capture` не завершився за 6 с (worker зайнятий/недоступний; ADR 021) → UI: «Try again» або «Paste the job text instead». Timeout самої сторінки — `CAPTURE_UNAVAILABLE` |
| 503 | `UNAVAILABLE` | `/health/ready` не готовий, режим обслуговування |

`/api/auth/*` повертає коди Better Auth (напр. enumeration-safe `INVALID_CREDENTIALS`, `09-security-privacy.md` §4.3); `SIGNUP_CLOSED` і `ACCOUNT_LINK_REQUIRES_VERIFICATION` мапляться hook-ами Better Auth у цей каталог. На OAuth callback (`/api/auth/callback/*`) Better Auth не віддає JSON-помилку: код приходить у SPA як `?error=<CODE>` на `errorCallbackURL` (M0-02); статус із таблиці діє лише для програмних викликів. Ролі без доступу (admin) отримують `404`, окремого коду для ролі немає.

## 4. Idempotency-Key (A-07, S-18)

| Аспект | Правило |
|---|---|
| Де | Обов'язковий на маршрутах з позначкою **IK**. На інших `POST` необов'язковий, але враховується |
| Формат | 8–128 символів `[A-Za-z0-9_-]`. Клієнт генерує UUID v4/v7 на кожну логічну дію (drag, submit) |
| Scope | `(userId, key)`. Різні користувачі з однаковим ключем не конфліктують |
| TTL | 24 год (`IdempotencyRecord.expiresAt`) |
| Хеш | `requestHash = sha256(method + route template + path params + canonical JSON body)` |
| Збіг ключа і хешу | Replay збереженої відповіді (той самий status + body) з заголовком `Idempotent-Replayed: true` |
| Збіг ключа, інший хеш або маршрут | `422 IDEMPOTENCY_KEY_REUSED` |
| Паралельний запит | Запис вставляється в транзакції мутації. Друга транзакція чекає на unique-lock, після commit першої робить replay, після timeout (5 с) повертає `409 IDEMPOTENCY_IN_PROGRESS` |
| Що зберігається | Тільки відповіді 2xx і 4xx з детермінованим результатом (409, 422). 5xx не зберігаються, бо retry має право виконатись |

## 5. Ліміти (S-20)

| Ліміт | Значення |
|---|---|
| JSON body | 1 MB → `413` |
| CSV-імпорт | 1 MB, ≤ 5 000 рядків, UTF-8 (BOM дозволено) (S-10) |
| Файл документа | 5 MB, PDF/DOCX; presigned **PUT** з підписаними `Content-Length` і `Content-Type` (R2 не підтримує POST policy; S-08, `09-security-privacy.md` §6) |
| `limit` у списках | ≤ 100; bulk-операції ≤ 100 id |
| Текстові поля | `notes`, `descriptionText` ≤ 50 000 символів; `title` ≤ 300 |
| Загальний throttle | 300 запитів/хв на користувача (Redis, sliding window) |
| Auth (`/api/auth/*`) | значення — `09-security-privacy.md` §4.3 (sign-in на (IP, email) і на IP, reset, sign-up) |
| `POST /jobs/capture` | 30/год на користувача |
| `POST /import/csv/preview` | 20/год |
| `POST /me/export` | 3/добу |
| `POST /demo/session` | Turnstile + ≤ 3/добу на IP, ≤ 200 активних demo глобально (`09-security-privacy.md` §11) |
| AI | бюджетом, не rate limit — `07-ai.md` |

## 6. Рівні доступу

| Позначка | Значення |
|---|---|
| `public` | без сесії |
| `user` | валідна сесія; дані з `findOwned(userId, …)` |
| `fresh` | `user` + сесія створена ≤ 10 хв тому (Better Auth `session.freshAge = 600`, S-05), інакше `403 FRESH_SESSION_REQUIRED` → UI просить увійти знову |
| `admin` | `user` + `role = ADMIN`. Для інших ролей → `404`. Доступ лише через tunnel (S-19, `12-infra-ops.md`) |
| `no-demo` | для demo-користувача (`User.demoExpiresAt IS NOT NULL`) → `403 DEMO_FEATURE_DISABLED` |

Кожен маршрут таблиць нижче має запис у route-реєстрі, з якого генерується IDOR suite (T-02, `11-testing.md`).

## 7. Endpoints R0

R0 включає тільки Google OAuth, ручну форму вакансії (paste text), CRM, Today/Overdue, CSV import/export. Без URL fetcher і без notification centre (SPEC-REVIEW §3).

### 7.1. Auth, акаунт, health

| Method | Path | Auth | FR | Notes |
|---|---|---|---|---|
| POST | `/api/auth/sign-in/social` | public | FR-AUTH | `{ provider: "google", callbackURL, errorCallbackURL: "/sign-in" }` → redirect URL |
| GET | `/api/auth/callback/google` | public | FR-AUTH | Better Auth; linking тільки при `email_verified` (S-07). Помилки — redirect на `errorCallbackURL?error=<CODE>`, не JSON: email поза allowlist → `?error=SIGNUP_CLOSED` (FR-AUTH-02) |
| POST | `/api/auth/sign-out` | user | FR-AUTH | |
| GET | `/api/auth/get-session` | user | FR-AUTH | |
| GET | `/health/live` · `/health/ready` | public | — | liveness / readiness (DB, Redis; деталі — `12-infra-ops.md` §9) |
| GET | `/me` | user | FR-AUTH | user + settings |
| PATCH | `/me/settings` | user | FR-PROF | R0: `timezone`, `staleFollowUpDays`, `staleDaysAfterInterview`, `staleGhostDays`, `hotkeysEnabled` |

### 7.2. Jobs (приватні)

| Method | Path | Auth | FR | Notes |
|---|---|---|---|---|
| POST | `/jobs` | user | FR-JOB | ручна форма, `visibility = PRIVATE`, `extractionMethod = MANUAL`; дубль URL → `409 CONFLICT_DUPLICATE_JOB` |
| GET | `/jobs/:id` | user | FR-JOB | `findAccessibleJob` (A-09) |
| PATCH | `/jobs/:id` | user | FR-JOB | тільки PRIVATE і owner |
| DELETE | `/jobs/:id` | user | FR-JOB | тільки PRIVATE; у заявок `jobId → null`, snapshot лишається (A-17) |

### 7.3. Applications

| Method | Path | Auth | FR | Notes |
|---|---|---|---|---|
| GET | `/applications` | user | FR-APP | `status[]`, `q`, `archived`, `channel`, `origin`, `sort` (`updatedAt`/`appliedAt`/`createdAt`), cursor. `view=kanban` групує по статусах, без cursor, ≤ 500 карток. Кожен item має `daysSinceActivity` і `isStale` (рахуються при читанні, P-04) |
| POST | `/applications` | user | FR-APP | `jobId?` або inline `job` (створює PRIVATE Job у тій самій транзакції); без job потрібні `companyName` + `roleTitle`. Активна заявка на цей job → `409 CONFLICT_ACTIVE_APPLICATION`. IK |
| GET | `/applications/:id` | user | FR-APP | поля + активний next action |
| PATCH | `/applications/:id` | user | FR-APP | поля, крім `status` і `nextAction*` |
| DELETE | `/applications/:id` | user | FR-APP | hard delete з events/reminders (A-17, P-07) |
| POST | `/applications/:id/transitions` | user | FR-APP | `{ toStatus, occurredAt?, note? }` → event `STATUS_CHANGED`; той самий статус або архівна заявка → `409 INVALID_TRANSITION`. **IK** |
| POST | `/applications/:id/archive` · `/unarchive` | user | FR-APP | unarchive може дати `409 CONFLICT_ACTIVE_APPLICATION`. Undo архівування = `unarchive` |
| POST | `/applications/bulk/archive` | user | FR-APP | `{ ids[≤100] }` → `{ archived, notFound[] }`. IK |
| GET | `/applications/:id/events` | user | FR-APP | timeline за `occurredAt`, cursor |
| POST | `/applications/:id/events` | user | FR-APP | `NOTE`, `MESSAGE_LOGGED`, `FOLLOW_UP_SENT` (backdated `occurredAt`) |
| DELETE | `/applications/:id/events/:eventId` | user | FR-APP | **Undo transition (R0):** видаляє останній `STATUS_CHANGED`, якщо він створений ≤ 15 с тому, і повертає статус до `fromStatus` (toast 10 с + запас на мережу, P-07). R1 (FR-APP-15): останній `STATUS_CHANGED` — без обмеження часу; `NOTE`/`MESSAGE_LOGGED`/`FOLLOW_UP_SENT`. Не останній / вікно минуло / `CREATED` → `409 CONFLICT_STATE` |
| GET | `/applications/export?format=csv\|json` | user | FR-IMP | синхронний стрім (P-09), фільтри як у списку; CSV з захистом від formula injection (S-10) |

### 7.4. Reminders (in-app, рахуються при читанні)

| Method | Path | Auth | FR | Notes |
|---|---|---|---|---|
| GET | `/reminders?range=today\|overdue\|upcoming` | user | FR-REM | межі дня — у `UserSettings.timezone`. R0: Today / Overdue / Upcoming (7 днів), FR-REM-02 |
| POST | `/reminders` | user | FR-REM | `{ applicationId?, kind, title, dueAt, asNextAction? }`. `asNextAction = true` замінює активний `NEXT_ACTION` і оновлює кеш `Application.nextAction*` (P-05). **R0:** лише next action — `applicationId` обов'язковий, `asNextAction = true`, інакше `400 VALIDATION_ERROR`; `source = MANUAL` (без `asNextAction`, `applicationId?`) — R1, FR-REM-04. IK |
| PATCH | `/reminders/:id` | user | FR-REM | `title`, `dueAt`, `status: DONE\|CANCELLED` |
| POST | `/reminders/:id/snooze` | user | FR-REM | `{ preset: "1d"\|"3d" }` або `{ until }` → новий `dueAt`, `snoozeCount++` |

### 7.5. CSV-імпорт (P-06)

| Method | Path | Auth | FR | Notes |
|---|---|---|---|---|
| POST | `/import/csv/preview` | user | FR-IMP | multipart `file` → `ImportSession`: заголовки, перші 10 рядків, знайдені значення статусів, вгаданий формат дати |
| POST | `/import/csv/commit` | user | FR-IMP | `{ importSessionId, mapping: { columns, statusValues, dateFormat } }` → report. Дедуп за `importKey` (company, role, appliedAt), backdated events `actor = IMPORT`. **IK**; повтор commit тієї самої сесії → replay |
| GET | `/import/sessions/:id` | user | FR-IMP | статус + report |

## 8. Endpoints R1

| Method | Path | Auth | FR | Notes |
|---|---|---|---|---|
| POST | `/api/auth/sign-up/email` · `/sign-in/email` | public | FR-AUTH | пароль ≥ 12 + HIBP, allowlist (S-06): sign-up поза allowlist → 403 `SIGNUP_CLOSED` |
| POST | `/api/auth/request-password-reset` · `/reset-password` | public | FR-AUTH | однакова відповідь для існуючого і неіснуючого email; після reset усі сесії анулюються |
| GET | `/api/auth/verify-email` | public | FR-AUTH | |
| GET | `/api/auth/list-sessions` | user | FR-AUTH | |
| POST | `/api/auth/revoke-session` | user | FR-AUTH | одна сесія |
| POST | `/api/auth/revoke-sessions` | user | FR-AUTH-09 | revoke-all (A-17), audit `SESSIONS_REVOKED` |
| PATCH | `/me/settings` | user | FR-AUTH | + `quietHours`, `aiEnabled`, `aiAllowedProfileParts` (audit `AI_SETTINGS_CHANGED`) |
| POST | `/me/export` | fresh, no-demo | FR-PRIV | async → `DataExport` (`202`, `{ id }`) |
| GET | `/me/exports/:id` | user | FR-PRIV | статус + `downloadUrl` (signed, ≤ 5 хв) при `READY` |
| DELETE | `/me` | fresh | FR-PRIV | `deletedAt` + `USER_DELETION_REQUESTED`, усі сесії revoke → `202` |
| POST | `/demo/session` | public | FR-DEMO | створює ефемерного demo-користувача (TTL 24 год) + сесію |
| GET | `/jobs` | user | FR-DISC | `JobQuery`: `q`, фільтри без зарплати (FR-DISC-03), `sort=newest\|relevance`; PUBLIC + власні PRIVATE |
| POST | `/jobs/capture` | user, no-demo | FR-JOB | `{ url?, text? }` → `JobDraft` (не зберігає). Синхронний для клієнта: API ставить job `capture` у чергу `capture` (`jobId` = `capture-<sha256(userId|canonicalUrl)>`, без `:`, `04-architecture.md` §5.4) і чекає ≤ 6 с; worker: SSRF-safe fetch через `safe-fetcher` → JSON-LD → `extract-job` (AI executor) (ADR 021). Помилка → `422 CAPTURE_UNAVAILABLE`; очікування > 6 с → `504 CAPTURE_TIMEOUT` (не зберігається в IK, retry дозволений). IK |
| PATCH | `/jobs/:id/user-state` | user | FR-DISC | `{ saved?, hidden?, hiddenReason?, note? }` → `UserJob` (A-21); `viewedAt` ставить `GET /jobs/:id` |
| GET | `/companies/search?q=` | user | FR-JOB | trigram autocomplete |
| GET · PATCH | `/profile` | user | FR-PROF | CareerProfile + preferences + hardFilters |
| GET · POST | `/profile/experiences` | user | FR-PROF | |
| PATCH · DELETE | `/profile/experiences/:id` | user | FR-PROF | |
| GET · POST | `/profile/educations` | user | FR-PROF | |
| PATCH · DELETE | `/profile/educations/:id` | user | FR-PROF | |
| PUT | `/profile/languages` | user | FR-PROF | заміна всього набору |
| GET | `/profile/skills` | user | FR-PROF | |
| PUT · DELETE | `/profile/skills/:skillId` | user | FR-PROF | upsert `UserSkill` |
| GET | `/skills/search?q=` | user | FR-PROF | name + aliases |
| POST | `/documents/uploads` | user, no-demo | FR-DOC | `{ documentId?, kind, title?, fileName, mimeType, sizeBytes }` → presigned PUT (`Content-Length`/`Content-Type` підписані) + `versionId`; версія `status = PENDING` |
| POST | `/documents/uploads/:versionId/complete` | user, no-demo | FR-DOC | `HEAD` об'єкта → карантин → magic bytes → `READY` / `REJECTED`; далі parse async |
| GET | `/documents` | user | FR-DOC | з версіями |
| GET · PATCH · DELETE | `/documents/:id` | user | FR-DOC | PATCH: `title`, `isDefault`; DELETE — усі версії + об'єкти storage |
| GET | `/documents/versions/:versionId/download-url` | user | FR-DOC | signed URL ≤ 5 хв, audit `DOCUMENT_DOWNLOADED` |
| GET · POST | `/applications/:id/interviews` | user | FR-INT | POST створює авто-reminders (24 год / 1 год) |
| PATCH · DELETE | `/interviews/:id` | user | FR-INT | |
| GET | `/interviews?from=&to=` | user | FR-INT | діапазон ≤ 92 дні (A-17) |
| GET | `/interviews/:id/ics` | user | FR-INT | `text/calendar` (A-17: було `/:id.ics`) |
| POST | `/applications/:id/stale/dismiss` | user | FR-APP-14 | `{ until }` → `staleDismissedUntil` |
| PATCH | `/applications/:id/events/:eventId` | user | FR-APP-15 | `payload` / `occurredAt`. Для `STATUS_CHANGED` — тільки `occurredAt` |
| GET · POST | `/contacts` | user | FR-APP | cursor, `q` |
| GET · PATCH · DELETE | `/contacts/:id` | user | FR-APP | |
| POST | `/applications/:id/contacts` | user | FR-APP | `{ contactId }` (A-17) |
| DELETE | `/applications/:id/contacts/:contactId` | user | FR-APP | видаляє лише зв'язок |
| GET | `/dashboard` | user | FR-DASH | Today, interviews 7 днів, pipeline counts, needs attention, this week |
| GET | `/analytics/overview` · `/funnel` · `/channels` | user | FR-ANL | `?from&to`; кожен блок має `n` і `insufficientData` |
| GET | `/notifications` | user | FR-NOTIF | cursor, `unread` |
| PATCH | `/notifications/:id/read` | user | FR-NOTIF | |
| POST | `/notifications/read-all` | user | FR-NOTIF | |
| GET · PUT | `/notification-preferences` | user | FR-NOTIF | матриця тип × канал × mode |
| GET | `/ai/usage` | user | FR-AI | сьогоднішнє використання і ліміт |

`extract-job` в R1 окремого маршруту не має: його викликає тільки `/jobs/capture` через AI executor (A-15).

## 9. Endpoints R2

| Method | Path | Auth | FR | Notes |
|---|---|---|---|---|
| GET | `/jobs?sort=match&minScore=` | user | FR-MATCH | keyset за `score`; `GET /matches` не вводимо, щоб не дублювати маршрут |
| GET | `/jobs?minSalaryUsdMonth=&sort=salary` | user | FR-DISC | фільтр і сортування за `salary*UsdMonth` — з salary normalization (R2) |
| GET | `/jobs/:id/match` | user | FR-MATCH | score, confidence, breakdown, strengths/gaps/unknowns |
| POST | `/jobs/:id/match/feedback` | user | FR-MATCH | `{ kind, comment? }` |
| GET · POST | `/saved-searches` | user | FR-DISC | |
| GET · PATCH · DELETE | `/saved-searches/:id` | user | FR-DISC | |
| POST | `/saved-searches/:id/run` | user | FR-DISC | оновлює `lastSeenAt` |
| POST | `/integrations/telegram/link` | user, no-demo | FR-NOTIF | одноразовий deep-link код (TTL 10 хв) |
| DELETE | `/integrations/telegram` | user | FR-NOTIF | |
| POST | `/integrations/telegram/webhook` | public | FR-NOTIF | `X-Telegram-Bot-Api-Secret-Token` |
| GET | `/admin/sources` | admin | FR-DISC | health: lastSuccess, failures, missedRuns |
| PATCH | `/admin/sources/:id` | admin | FR-DISC | `enabled` (onboarding checklist — `08-ingestion-matching.md`), audit `ADMIN_ACTION` |
| POST | `/admin/sources/:id/run` | admin | FR-DISC | позачерговий прогін |

## 10. Endpoints R3 (окремий маршрут на AI-задачу, A-17)

Спільне для всіх: auth `user, no-demo` (demo отримує заглушку з `07-ai.md`), перевірки `AI_DISABLED` / `AI_BUDGET_EXCEEDED` / `AI_INVALID_OUTPUT` виконує executor, на кожному маршруті є IK. Відповідь має форму `{ runId, output, contextUsed[] }`.

| Method | Path | FR | Body |
|---|---|---|---|
| POST | `/ai/analyze-job` | FR-AI | `{ jobId }` |
| POST | `/ai/tailor-cv` | FR-AI | `{ jobId, documentVersionId }` |
| POST | `/ai/draft-message` | FR-AI | `{ jobId?, applicationId?, type, tone }` |
| POST | `/ai/recruiter-reply` | FR-AI | `{ applicationId, message }` |
| POST | `/ai/interview-prep` | FR-AI | `{ interviewId }` |
| POST | `/ai/parse-cv` | FR-AI | `{ documentVersionId }` → diff; застосування — звичайні `/profile/*` |
| GET | `/ai/runs` | FR-AI | історія + usage, cursor |

## Зміни відносно v2.0

- **A-17** — додано `DELETE /applications/:id`, `DELETE /jobs/:id`, PATCH/DELETE events, bulk archive, `POST /reminders`, `GET /interviews?from&to`, contact links, revoke-all sessions; `/interviews/:id.ics` → `/ics`; окремий маршрут на кожну AI-задачу замість `/ai/tasks/:task`.
- **A-18** — keyset `(sortValue, id)` NULLS LAST; bounded offset ≤ 500 для relevance.
- **A-19** — каталог error codes (§3.1).
- **A-07/S-18** — Idempotency-Key у scope `(userId, key)`, 24 год, хеш тіла, 422 при mismatch.
- **A-15** — `extract-job` без власного маршруту в R1, AI-перевірки в executor.
- **A-21** — `PUT /jobs/:id/state` → `PATCH /jobs/:id/user-state`.
- **P-05** — next action задається лише через `/reminders`.
- **P-06** — `/import/csv/preview` + `/import/csv/commit`.
- **P-07** — Undo transition через DELETE останнього `STATUS_CHANGED` у вікні 15 с (R0); undo archive = unarchive.
- **P-22** — `409 CONFLICT_ACTIVE_APPLICATION` → UI пропонує заархівувати стару заявку.
- Каталог доповнено кодами з `09`/`03`/`07`: `SIGNUP_CLOSED`, `CSRF_ORIGIN`, `ACCOUNT_LINK_REQUIRES_VERIFICATION`, `INVALID_TRANSITION`, `AI_*`.
- Фільтр/сортування за зарплатою в `/jobs` — R2 (разом із salary normalization).
- **P-09** — синхронний `GET /applications/export` у R0.
- **P-10, SPEC-REVIEW §3** — R0: тільки Google OAuth, без `/jobs/capture` і notification centre (перенесено в R1).
- **S-05** — `fresh` (≤ 10 хв) для `DELETE /me` і `POST /me/export`.
- **S-08** — presigned PUT з підписаними `Content-Length`/`Content-Type`.
- **S-20** — ліміти body/CSV/limit і throttles (§5).
- **Рішення 7** — `POST /demo/session`, позначка `no-demo`.
- `GET /matches` прибрано на користь `GET /jobs?sort=match`.
