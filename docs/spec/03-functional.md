# Функціональні вимоги

> Applyra spec v2.1 · Зона: вимоги `FR-<AREA>-NN` з релізами та acceptance criteria · Пов'язані: `02-releases.md`, `05-data-model.md`, `06-api.md`, `07-ai.md`, `08-ingestion-matching.md`, `09-security-privacy.md`, `10-frontend-ux.md`

## 1. Конвенції

- ID: `FR-<AREA>-NN`, стабільні; посилатися в issues/PR. Нові вимоги — наступний вільний номер, видалені не перевикористовуються.
- Реліз: `R0…R3`, `Later`. Тег у цьому файлі — головний для обсягу (див. `02-releases.md` §1).
- AC перевіряються тестом (unit / integration / E2E) або вручну, якщо позначено «(manual)».
- Endpoints названі за призначенням; маршрути — див. `06-api.md`. Сутності й поля — див. `05-data-model.md`.
- Скрізь: чужий ресурс → 404 (не 403), неавторизований запит → 401 (див. `09-security-privacy.md`).

### 1.1. Терміни

| Термін | Визначення |
|---|---|
| Активність заявки | Будь-який `ApplicationEvent`, створений діями користувача (включно з імпортом). `Application.lastActivityAt` = max(`occurredAt`) таких подій. Системні дії (доставка reminder, перерахунки) активністю не є |
| Днів без активності | `floor((now − lastActivityAt) / 1 day)` у timezone користувача; рахується при читанні |
| Відкритий reminder | `Reminder` у стані, що не є done/cancelled |
| Відповідь роботодавця | Перший перехід заявки в `SCREENING`, `INTERVIEW`, `TEST_TASK`, `OFFER`, `ACCEPTED` або `REJECTED` після досягнення `APPLIED`. `GHOSTED` і `WITHDRAWN` — не відповідь |
| Стадії воронки | Упорядковані: `APPLIED < SCREENING < INTERVIEW < TEST_TASK < OFFER < ACCEPTED` |

## 2. AUTH — автентифікація та акаунт

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-AUTH-01 | R0 | Sign in / sign out через **Google OAuth** (єдиний спосіб у R0) | • Успішний вхід створює сесію і веде на `/today`, якщо є due/overdue reminders, інакше на `/applications` (перший вхід / немає даних — onboarding empty state, `10-frontend-ux.md` §1, §3) · • Sign out інвалідує поточну сесію на сервері, не лише cookie |
| FR-AUTH-02 | R0 | **Allowlist реєстрації**: новий акаунт створюється лише для email зі allowlist (конфіг/інвайт) | • Email поза allowlist → акаунт не створюється, відповідь — `403 SIGNUP_CLOSED` із загальним повідомленням «Access is invite-only» без розкриття, чи існує акаунт · • Існуючі користувачі входять без перевірки allowlist |
| FR-AUTH-03 | R0 | Захист приватних endpoints | • Будь-який запит без валідної сесії до приватного endpoint → 401 · • Виняток: auth, health, старт demo |
| FR-AUTH-04 | R0 | Життєвий цикл сесії | • Idle TTL 7 днів, absolute TTL 30 днів (конфіг); після спливу → 401 і повторний вхід · • Session id змінюється при вході (rotation) · • Cookie-атрибути — див. `09-security-privacy.md` |
| FR-AUTH-05 | R1 | Email + password: sign up, sign in, **email verification** | • Пароль ≥ 12 символів (≤ 128), без вимог до складу · • Пароль перевіряється через HIBP (k-anonymity); скомпрометований → відмова з поясненням · • До верифікації email чутливі дії (export, delete, linking) недоступні · • Allowlist (FR-AUTH-02) діє і тут |
| FR-AUTH-06 | R1 | Reset password | • Токен одноразовий, TTL 30 хв · • Після reset **усі інші сесії** інвалідуються · • Запит reset для будь-якого email → однакова відповідь «If an account exists, we sent a link» |
| FR-AUTH-07 | R1 | Захист від account enumeration | • Sign in з невідомим email і з неправильним паролем → ідентична відповідь (текст, статус) · • Sign up на зайнятий email → та сама відповідь, що й на успіх; власнику email надсилається лист · • Rate limit auth — див. `09-security-privacy.md` |
| FR-AUTH-08 | R1 | Linking Google ↔ email-акаунт | • Автоматичне зв'язування лише якщо `email_verified = true` **з обох сторін** (Google і локальний акаунт) · • Інакше вхід через Google на зайнятий email → `409 ACCOUNT_LINK_REQUIRES_VERIFICATION` з порадою увійти паролем і зв'язати вручну |
| FR-AUTH-09 | R1 | Керування сесіями | • Список активних сесій (пристрій, час) · • Revoke однієї / усіх інших · • Зміна пароля інвалідує всі інші сесії |
| FR-AUTH-10 | R1 | **Re-auth** для чутливих дій: видалення акаунта, повний експорт, зміна пароля, linking | • Якщо останній вхід > 10 хв тому → вимога повторної автентифікації (пароль або Google re-consent) · • Без re-auth дія відхиляється з `403 FRESH_SESSION_REQUIRED` (див. `06-api.md` §3.1, §6) |

## 3. JOB — capture і вакансії

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-JOB-01 | R0 | **Ручна форма вакансії** (кнопка «+ Add job», хоткей `N`): обов'язкові title, companyName; опційні location, workMode, employmentType, seniority, salary (min/max/currency/period/gross), URL, опис | • У R0 створює лише `Job` з `visibility = PRIVATE`, `ownerId = user` (`UserJob` з'являється в R1, FR-JOB-10; міграція R1 робить backfill `UserJob(savedAt = Job.createdAt)` для наявних приватних вакансій) · • «Save & create application» створює ще й `Application` (FR-APP-01) атомарно |
| FR-JOB-02 | R0 | **Paste text**: вставлений текст вакансії зберігається як опис без розбору (без fetch і без LLM) | • Текст зберігається як plain text; HTML не рендериться · • Ліміт розміру — див. `06-api.md` |
| FR-JOB-03 | R0 | `originalUrl` і **`canonicalUrl`** | • Якщо URL надано, `originalUrl` зберігається завжди · • `canonicalUrl`: lower-case host, без `www.`, без fragment, `utm_*`, `fbclid`, `gclid`, `ref`, без trailing slash (чиста функція з unit-тестами) |
| FR-JOB-04 | R0 | Дедуп при створенні в межах користувача | • Якщо в користувача вже є приватна вакансія з тим самим `canonicalUrl` → нова не створюється, UI показує «You already saved this» з посиланням · • R2: якщо `canonicalUrl` є в публічному каталозі → створюється лише `UserJob` на публічну вакансію |
| FR-JOB-05 | R0 | Редагування приватної вакансії | • Редагувати може тільки owner; чужа приватна → 404 · • PUBLIC-вакансії не редагуються користувачем (тільки нотатка в `UserJob`) |
| FR-JOB-06 | R0 | **Видалення** приватної вакансії | • Confirm-діалог · • Пов'язані заявки лишаються зі snapshot `companyName` / `roleTitle`, посилання на вакансію знімається · • Повторне видалення → 404 |
| FR-JOB-07 | R1 | **URL capture**: один safe fetch → пошук `schema.org/JobPosting` у JSON-LD → `JobDraft` | • Чернетка нічого не зберігає до підтвердження · • Кожне поле має позначку джерела (`json_ld` / `llm` / `user`) і confidence · • Сторінка недоступна (403, CAPTCHA, login wall, timeout, не HTML) → «Paste the job text instead», жодних повторних спроб · • Мережеві правила fetch — див. `09-security-privacy.md` |
| FR-JOB-08 | R1 | LLM fallback: якщо JSON-LD немає або полів не вистачає і є текст → `extract-job` (FR-AI-01) | • Жодне поле з `llm` не зберігається без явного підтвердження · • Якщо AI вимкнено (FR-AI-06) → чернетка лише з JSON-LD/порожня, без помилки |
| FR-JOB-09 | R1 | **Політика capture за доменами** | • `linkedin.com` (і піддомени) — **paste-only**: fetch не виконується, URL зберігається як `originalUrl` · • Інші домени — fetch лише якщо `robots.txt` дозволяє шлях для нашого User-Agent і домен не позначено в denylist (конфіг, перегляд ToS — див. `08-ingestion-matching.md`) · • Заборонено → той самий UX, що й у FR-JOB-07 («Paste the job text instead») · • Captured контент завжди `PRIVATE` і ніколи не потрапляє в публічний каталог |
| FR-JOB-10 | R1 | Стан вакансії для користувача (`UserJob`): save / unsave / hide / unhide, `viewedAt` | • Hidden за замовчуванням виключені зі списків і пошуку · • Стан однієї вакансії не впливає на інших користувачів |

## 4. APP — applications CRM

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-APP-01 | R0 | Створення заявки — з вакансією або **без** (рекрутер написав у Telegram) | • Без вакансії обов'язкові `companyName`, `roleTitle` · • Поля: origin (`SELF_APPLIED / RECRUITER_OUTREACH / REFERRAL / OTHER`), channel, priority, appliedAt, salary expected, notes (markdown) · • Створюється подія `CREATED` |
| FR-APP-02 | R0 | Унікальність і повторна подача | • Одна **активна** (`archivedAt IS NULL`, незалежно від статусу, у т.ч. `REJECTED`) заявка на (user, job): повтор → `409 CONFLICT_ACTIVE_APPLICATION` з `existingApplicationId` · • UI пропонує «Archive the old application and create a new one»; після підтвердження стара архівується, нова створюється (повторна подача після `REJECTED`) · • Заявки без вакансії не обмежуються (`05-data-model.md` §6.1) |
| FR-APP-03 | R0 | Статуси `WISHLIST → APPLIED → SCREENING → INTERVIEW → TEST_TASK → OFFER → ACCEPTED`; термінальні `REJECTED · WITHDRAWN · GHOSTED` (reopen дозволено). Переходи будь-які | • Кожен перехід пише рівно одну подію `STATUS_CHANGED` з `fromStatus`, `toStatus`, `occurredAt` · • `occurredAt` може бути в минулому, не в майбутньому (> now + 5 хв → 400 `VALIDATION_ERROR`) · • Перехід у поточний статус або для архівної заявки → `409 INVALID_TRANSITION` · • Перший перехід у `APPLIED` при порожньому `appliedAt` встановлює його = `occurredAt` |
| FR-APP-04 | R0 | **Idempotency** переходів | • Повтор запиту з тим самим `Idempotency-Key` повертає ту саму відповідь і не створює дубль події (`IdempotencyRecord`, ключ у межах користувача) · • Той самий ключ з іншим тілом → `422 IDEMPOTENCY_KEY_REUSED` |
| FR-APP-05 | R0 | **Undo toast 10 с** після переходу (drag, «Move to…», inline select) і архівування | • Undo переходу = `DELETE` останньої події `STATUS_CHANGED`: повертає `fromStatus` і прибирає подію з timeline · • Сервер приймає undo, лише якщо подія остання і створена ≤ 15 с тому, інакше `409 CONFLICT_STATE` · • Undo архівування = unarchive · • Після 10 с toast зникає, undo недоступний (маршрути — `06-api.md` §7.3) |
| FR-APP-06 | R0 | **Kanban**: колонки = статуси (термінальні згорнуті), drag & drop, альтернатива — меню «Move to…» | • Optimistic update; помилка сервера → rollback картки + toast · • Перехід доступний з клавіатури і без drag (див. `10-frontend-ux.md`) · • Картка: company, role, salary, «N днів без активності», next action |
| FR-APP-07 | R0 | **Table**: sorting, filtering (status, origin, channel, archived), пошук за company/role, column visibility, bulk archive | • Фільтри відображаються в URL (shareable/back-button) · • Bulk archive N заявок → N подій, одна операція |
| FR-APP-08 | R0 | **Detail** (drawer + повна сторінка): поля, notes, timeline, next action | • У R0 немає вкладок contacts / interviews / CV (з'являються з FR-APP-16, FR-INT-01, FR-DOC-03) |
| FR-APP-09 | R0 | **Timeline** | • Сортування за `occurredAt` desc, при рівності — за часом створення · • Ретроспективні та імпортовані події стоять на своєму місці за `occurredAt` |
| FR-APP-10 | R0 | Ручні події: note, message logged, follow-up sent — з `occurredAt` | • Подія оновлює `lastActivityAt` (якщо новіша) |
| FR-APP-11 | R0 | Archive / unarchive (`archivedAt` окремо від статусу) | • Архівні приховані з Kanban і Table за замовчуванням; фільтр «Archived» показує їх · • Архівування не змінює статус |
| FR-APP-12 | R0 | **Видалення заявки** | • Confirm + Undo 10 с (клієнт відкладає видалення; Undo скасовує) · • Видаляє заявку з подіями, reminders (і з R1 — interviews, зв'язки з contacts) · • Чужа → 404 |
| FR-APP-13 | R0 | **Активність**: бейдж «N днів без активності» | • Значення = визначення §1.1, рахується при читанні · • Колір + текст (не тільки колір) |
| FR-APP-14 | R1 | **Stale-підказки** — рахуються при читанні для статусів `APPLIED…TEST_TASK` (`APPLIED`, `SCREENING`, `INTERVIEW`, `TEST_TASK`) | • Днів без активності ≥ `staleFollowUpDays` (default 7) для `APPLIED`/`SCREENING` або ≥ `staleDaysAfterInterview` (default 10) для `INTERVIEW`/`TEST_TASK` → підказка «Follow up» · • ≥ `staleGhostDays` (default 21) → підказка «Mark as ghosted?» · • «Dismiss» ставить `staleDismissedUntil` (default +7 днів); нова активність знімає dismiss · • **`GHOSTED` ставить тільки користувач**; система ніколи не змінює статус |
| FR-APP-15 | R1 | Редагування і видалення подій | • `NOTE`, `MESSAGE_LOGGED`, `FOLLOW_UP_SENT`: редагування тексту і `occurredAt`, видалення · • `STATUS_CHANGED`: редагування `occurredAt`; видалити можна тільки останню — статус повертається до її `fromStatus` · • `CREATED` не видаляється · • `lastActivityAt` перераховується |
| FR-APP-16 | R1 | **Contacts**: CRUD, прив'язка до заявок (many-to-many), роль (recruiter / hiring manager / referrer / other) | • Контакт — персональні дані третьої особи: видаляється повністю, без збереження в audit metadata · • Видалення контакту не видаляє заявки |

## 5. REM — reminders і follow-ups

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-REM-01 | R0 | **Reminder — джерело правди**; `Application.nextAction*` — кеш | • Встановлення next action на заявці робить upsert `Reminder` (`source = NEXT_ACTION`) і оновлює кеш **в одній транзакції** · • На заявку — не більше одного відкритого follow-up reminder (`NEXT_ACTION`) · • Очищення next action скасовує reminder; кеш завжди збігається з відкритим reminder (integration-тест) |
| FR-REM-02 | R0 | Списки **Today / Overdue / Upcoming (7 днів)** — рахуються при читанні, без worker | • Межі «сьогодні» — у timezone з `UserSettings` · • Overdue = відкриті з `dueAt` до початку сьогодні; Today = у межах сьогодні · • Тести на зміну дати біля опівночі та DST |
| FR-REM-03 | R0 | Дії: **Done**, **Snooze** (1 день / 3 дні / дата), **Cancel** | • Done/Cancel для `NEXT_ACTION` очищає кеш заявки · • Snooze змінює `dueAt` і кеш · • Done створює подію `FOLLOW_UP_SENT`, якщо користувач позначив «I followed up» |
| FR-REM-04 | R1 | **Custom reminders** (`source = MANUAL`), опційно прив'язані до заявки | • Не впливають на `nextAction*` · • Кількість на заявку не обмежена |
| FR-REM-05 | R1 | Доставка worker-ом у канали (in-app, email; R2 — Telegram) | • Рівно одна доставка на (reminder, `dueAt`, channel) — `ReminderDelivery` унікальний · • Snooze дає новий `dueAt` → дозволена нова доставка · • Retry воркера не створює дубль |
| FR-REM-06 | R1 | **Quiet hours** і timezone | • Доставка, що припадає на quiet hours користувача, відкладається до їх кінця · • Списки FR-REM-02 від quiet hours не залежать |
| FR-REM-07 | R1 | Шаблони follow-up (статичні); AI-чернетка — R3 (FR-AI-02) | • **Нічого не надсилається від імені користувача**: тільки «Copy» або `mailto:` |

## 6. INT — інтерв'ю (частина Application)

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-INT-01 | R1 | CRUD інтерв'ю в заявці: kind (`RECRUITER_SCREEN / TECHNICAL / SYSTEM_DESIGN / BEHAVIORAL / TEST_TASK_REVIEW / FINAL / OTHER`), startsAt, duration, timezone, meetingUrl, interviewers, prep notes, debrief notes, outcome | • Створення пише подію `INTERVIEW_SCHEDULED` · • `meetingUrl` — тільки `http(s)` |
| FR-INT-02 | R1 | Авто-reminders за 24 год і за 1 год (`source = INTERVIEW_AUTO`, `kind = INTERVIEW`) | • Створюються з інтерв'ю; перенесення оновлює `dueAt`; видалення скасовує · • Вимикаються в налаштуваннях (глобально) |
| FR-INT-03 | R1 | Debrief-шаблон: питання / що було складно / що повторити / наступні кроки | • Шаблон вставляється в порожнє поле debrief однією дією |
| FR-INT-04 | R1 | Експорт `.ics` | • Стабільний UID на інтерв'ю; коректний час з timezone; відкривається в Google Calendar і Outlook (manual) |
| FR-INT-05 | R1 | Список майбутніх інтерв'ю за діапазоном дат (для Dashboard) | • Тільки інтерв'ю користувача, сортовані за `startsAt` |

## 7. PROF — налаштування, профіль, навички

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-PROF-01 | R0 | **`UserSettings`**: timezone, `staleFollowUpDays` (7), `staleDaysAfterInterview` (10), `staleGhostDays` (21), `hotkeysEnabled` | • Timezone при першому вході береться з браузера (`Intl`), редагується в Settings · • Невалідна IANA-зона → `400 VALIDATION_ERROR` · • Дати/числа/валюти форматуються через `Intl` |
| FR-PROF-02 | R1 | Quiet hours у `UserSettings` (default 22:00–08:00 локально, можна вимкнути) | • Використовуються FR-REM-06, FR-NOTIF-03 |
| FR-PROF-03 | R1 | **Career Profile**: personal (name, location, links), summary (headline, about, years, seniority, target roles), work experience (company, position, dates, description, achievements, skills), education, languages (CEFR) | • Timezone не дублюється в профілі — тільки `UserSettings` · • Посилання — тільки `http(s)` |
| FR-PROF-04 | R1 | **Skills**: з каталогу `Skill` (autocomplete + aliases: `node`, `nodejs`, `node.js` → `Node.js`); `UserSkill`: level 1–5, years, last used, preference (`PREFERRED / NEUTRAL / AVOID`) | • Пошук за alias повертає канонічну навичку · • Дубль навички в профілі неможливий |
| FR-PROF-05 | R1 | Preferences: work modes, employment types, countries/timezones, salary min/desired + currency + period, relocation, excluded companies; **hard filters** — користувач позначає, які preferences жорсткі | • Hard filter зберігається окремо від значення (наприклад, remote = hard, salary min = soft) |
| FR-PROF-06 | R2 | Зміна профілю → перерахунок matching | • Не частіше ніж раз на 5 хв на користувача (debounce) |

## 8. DOC — документи / CV

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-DOC-01 | R1 | Upload PDF/DOCX ≤ 5 MB у приватне сховище | • Файл недоступний (quarantine) до перевірки типу за magic bytes · • Невідповідність типу/розміру → файл видаляється, помилка користувачу · • Деталі upload і парсингу — див. `09-security-privacy.md` |
| FR-DOC-02 | R1 | **Immutable версії**: `Document` групує `DocumentVersion`; «редагування» = нова версія | • Версія ніколи не перезаписується · • Один default CV на користувача |
| FR-DOC-03 | R1 | Заявка посилається на **конкретну `DocumentVersion`** | • Нова версія не змінює заявки, що посилаються на стару · • Видалена версія → у заявці «CV version deleted» |
| FR-DOC-04 | R1 | Витяг тексту (PDF, DOCX) → `parsedText` | • Помилка парсингу → статус FAILED, файл лишається придатним для download · • Парсинг не блокує upload-відповідь |
| FR-DOC-05 | R1 | Download | • Тільки через short-lived signed URL після перевірки власника; публічних URL немає · • Чужий документ → 404 |
| FR-DOC-06 | R1 | Видалення документа / версії | • Об'єкт у сховищі видаляється ≤ 1 год · • Повторний download видаленого → 404 |

## 9. DISC — вакансії, пошук, saved searches

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-DISC-01 | R1 | Список вакансій користувача: картки з title, company, location/work mode, salary (оригінал; R2 — + USD/міс), seniority, навички, дата, джерело, стан | • Показуються приватні вакансії користувача і (R2) публічні · • Чужі приватні ніколи не потрапляють у список/пошук (IDOR-тест) |
| FR-DISC-02 | R1 | **Пошук** по title, company, skills, description (FTS + trigram) | • Частковий збіг і одна помилка в title знаходять вакансію (наприклад, `Reakt` → `React Developer`) · • Пошук нечутливий до регістру і діакритики |
| FR-DISC-03 | R1 | **Фільтри**: work mode, seniority, salary disclosed, employment type, country, date posted, source, skills include/exclude, excluded companies, saved/hidden | • Комбінація фільтрів — AND · • R2: min salary USD/міс (з salary normalization), min match score, English level |
| FR-DISC-04 | R1 | Сортування: newest, relevance (є query); R2 — salary (USD/міс), match | • Cursor pagination стабільна: при однакових значеннях сортування немає дублів і пропусків між сторінками (keyset, див. `06-api.md`) |
| FR-DISC-05 | R1 | Job detail: усі поля, опис (sanitized HTML), notes, «Create application», «Open original»; R2 — джерела-дублікати, match explanation | • HTML опису рендериться тільки після санітизації |
| FR-DISC-06 | R2 | Публічний каталог з ingestion (див. `08-ingestion-matching.md`) | • Закриті вакансії позначені, за замовчуванням приховані |
| FR-DISC-07 | R2 | **Saved searches** (`SavedSearch`): name, query (та сама схема, що й у пошуку), notify `NONE / DAILY / WEEKLY`, лічильник нових з `lastSeenAt` | • Відкриття saved search оновлює `lastSeenAt` і обнуляє лічильник · • Digest містить тільки нові з останнього запуску |

## 10. MATCH — matching

Алгоритм, ваги, тригери — див. `08-ingestion-matching.md`.

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-MATCH-01 | R2 | Результат: score 0–100 або null, confidence 0–1, excluded + причини, breakdown по компонентах, strengths / gaps / unknowns | • Hard filter порушено → score = null, excluded = true, причини перелічені |
| FR-MATCH-02 | R2 | **Відсутні дані ≠ 0 балів** | • Компонент без даних → `unknown`, знижує confidence, але не score (unit-тест) |
| FR-MATCH-03 | R2 | UI: бейдж Strong ≥ 80 / Good ≥ 60 / Weak; popover з поясненням; «Why?» на job detail | • Confidence < 0.4 → «Not enough data» замість числа |
| FR-MATCH-04 | R2 | Feedback: `GOOD_MATCH / NOT_RELEVANT / SALARY_TOO_LOW / WRONG_SENIORITY / WRONG_LOCATION / MISSING_SKILL / NOT_INTERESTED_COMPANY` | • Зберігається і показується в analytics; автотюнінг ваг — Later |
| FR-MATCH-05 | R2 | Golden set і версіонування | • ≥ 20 пар (профіль, вакансія) з очікуваними діапазонами score в unit-тестах · • Будь-яка зміна алгоритму піднімає `algorithmVersion` |
| FR-MATCH-06 | R3 | Семантичний компонент (embeddings) | • Окремий `algorithmVersion`; без embeddings — поведінка v1 |

## 11. AI — AI-задачі

Архітектура, бюджети, prompt injection, evals — див. `07-ai.md`.

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-AI-01 | R1 | `extract-job`: текст вакансії → `JobDraft` | • Поля позначені `llm` + confidence · • Невалідний вивід після repair → чернетка без LLM-полів і повідомлення, не 500 · • Golden set ≥ 20 вакансій (вибір провайдера в M4) |
| FR-AI-02 | R3 | Задачі: `analyze-job` (summary, strengths, gaps, unknowns, red flags, questions), `tailor-cv` (пропозиції `{section, original, suggested, reason}`), `draft-message` (cover letter / recruiter intro / follow-up + тон), `recruiter-reply` (3 варіанти), `interview-prep`, `parse-cv` (секції профілю, diff перед застосуванням) | • Кожна задача — окрема дія в контексті (job detail, application, document) |
| FR-AI-03 | R1 | «Context used»: перед запуском користувач бачить, які дані підуть у запит | • Список частин (наприклад, «Skills, Experience (3), Vacancy») відповідає фактичному контексту (contract-тест) |
| FR-AI-04 | R3 | **Без вигадок**: твердження про кандидата мають `evidence` | • Твердження без evidence UI позначає як припущення |
| FR-AI-05 | R1 | Результат AI — **пропозиція**: Accept / Edit / Discard | • Нічого не пишеться в доменні дані без Accept · • Оригінали документів не змінюються |
| FR-AI-06 | R1 | AI можна вимкнути в налаштуваннях | • Вимкнено → жодна AI-задача не виконується, включно з `extract-job` всередині capture (перевірка в executor, не в route) |
| FR-AI-07 | R1 | Денний бюджет на користувача + глобальний денний ліміт у USD | • Перевищення бюджету користувача → `429 AI_BUDGET_EXCEEDED`, глобального cap → `AI_DISABLED`; виклику провайдера немає; запис у `AiRun` зі статусом `BUDGET_EXCEEDED` · • Використання — у `AiUsageDaily` / `AiGlobalUsageDaily` |

## 12. NOTIF — нотифікації

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-NOTIF-01 | R1 | **In-app центр**: список, лічильник непрочитаних, mark read, read all. Події: reminder due, interview soon, stale application, export ready; R2 — нові результати saved search | • У R0 центру немає; поверхня R0 — Today (FR-REM-02) |
| FR-NOTIF-02 | R1 | Email-нагадування і **daily digest** (за замовчуванням digest, а не лист на кожну подію) | • Digest надсилається раз на день о 08:00 локального часу лише якщо є зміст · • Налаштування тип × канал |
| FR-NOTIF-03 | R1 | Quiet hours і timezone | • Email у quiet hours не надсилається, відкладається |
| FR-NOTIF-04 | R1 | Відписка | • Кожен лист має one-click unsubscribe для свого типу |
| FR-NOTIF-05 | R2 | Telegram-бот для нагадувань (Could) | • Підключення через одноразовий код; відключення в Settings |

## 13. DASH — Today, onboarding, dashboard

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-DASH-01 | R0 | Екран **Today**: overdue і сьогоднішні reminders, upcoming 7 днів | • Дані — FR-REM-02; клік → заявка |
| FR-DASH-02 | R0 | **Onboarding R0**: порожній стан з двома діями — «Import CSV» і «Add first job» | • Без кроків профілю · • Навігація R0: Applications · Today · Settings |
| FR-DASH-03 | R1 | **Dashboard**: Today, інтерв'ю на 7 днів, Pipeline (кількість по статусах, клік → Applications з фільтром), Needs attention (stale), This week (applications sent, responses, interviews); quick actions: Add job, Add application, Log recruiter message | • Числа збігаються з Analytics за той самий період (integration-тест) |
| FR-DASH-04 | R1 | Onboarding R1: опційні кроки target role + work mode + salary → skills | • Кожен крок можна пропустити |
| FR-DASH-05 | R2 | «New for you»: топ нових вакансій за match | • Тільки не hidden і без заявки |

## 14. ANL — analytics

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-ANL-01 | R1 | **Funnel** за досягнутими стадіями (з подій, не з поточного статусу) | • Заявка «досягла» стадії, якщо мала статус ≥ цієї стадії в будь-який момент; пропущені стадії вважаються досягнутими · • `REJECTED` після `INTERVIEW` рахується в `APPLIED…INTERVIEW` |
| FR-ANL-02 | R1 | **Response rate** = заявки з відповіддю (§1.1) / заявки, що досягли `APPLIED` | • Рахується для origin `SELF_APPLIED` і `REFERRAL`; `RECRUITER_OUTREACH` показується окремо (там контакт ініціював роботодавець) · • Період фільтрується за `appliedAt` |
| FR-ANL-03 | R1 | Розбивка по `channel` і `origin` | • Сума сегментів = загальне значення |
| FR-ANL-04 | R1 | Median time-to-first-response | • Від `appliedAt` до першої відповіді; заявки без відповіді не входять |
| FR-ANL-05 | R1 | Мала вибірка | • Скрізь показано `n`; n < 5 → «not enough data» замість числа |
| FR-ANL-06 | R2 | Source performance для каталогу, salary distribution у збережених вакансіях | • Зарплати — у USD/міс з позначкою нормалізації |

## 15. PRIV — privacy controls

Сховища, retention, що саме видаляється — див. `09-security-privacy.md`.

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-PRIV-01 | R1 | **Повний експорт** (JSON + файли CV у zip) асинхронно → `DataExport`, посилання на 24 год | • Re-auth (FR-AUTH-10) · • Одночасно один активний експорт · • Нотифікація «export ready» · • Після 24 год посилання і файл недоступні |
| FR-PRIV-02 | R1 | **Видалення акаунта** | • Re-auth · • Одразу: усі сесії інвалідуються, дані недоступні · • Hard delete персональних даних і файлів ≤ 24 год · • E2E-тест |
| FR-PRIV-03 | R1 | AI settings: увімкнути/вимкнути AI, які частини профілю дозволено передавати | • Заборонені частини ніколи не потрапляють у контекст (contract-тест) |
| FR-PRIV-04 | R0 | Видалення окремих заявок і вакансій | • Див. FR-APP-12, FR-JOB-06; документи — FR-DOC-06 (R1) |

## 16. IMP — імпорт / експорт

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-IMP-01 | R0 | **CSV import, крок preview** (`ImportSession`): мапінг колонок (автовгадування за заголовками), **мапінг значень статусу** (кожне унікальне значення → `ApplicationStatus` або «skip»), **вибір формату дати** (`DD.MM.YYYY` / `MM/DD/YYYY` / `YYYY-MM-DD`), preview перших 10 рядків, помилки по рядках | • Нічого не пишеться в заявки до commit · • Неоднозначні дати (`03/04/2025`) без явного формату → помилка рядка · • Немає обов'язкових company/role → помилка рядка |
| FR-IMP-02 | R0 | **Commit** (idempotent) | • Повторний commit тієї ж сесії не створює дублів · • **Повторний імпорт файлу**: рядок, що збігається з існуючою заявкою за (нормалізований company, нормалізований role, дата `appliedAt`), пропускається; звіт «N created, M skipped as existing, K errors» |
| FR-IMP-03 | R0 | **Backdated events** | • Кожен рядок створює `CREATED` з `occurredAt` = `appliedAt` (або час імпорту) · • Якщо статус ≥ `APPLIED` → `STATUS_CHANGED` у `APPLIED` на `appliedAt`, далі в поточний статус на дату з мапленої колонки (або `appliedAt`) · • Funnel (FR-ANL-01) коректний для імпортованих даних |
| FR-IMP-04 | R0 | **Ліміти** | • Файл ≤ 1 MB і ≤ 5 000 рядків, інакше відмова до парсингу · • UTF-8 (BOM дозволено), роздільник `,` або `;` (автовизначення) |
| FR-IMP-05 | R0 | **Синхронний експорт** заявок у CSV і JSON (JSON — з подіями) | • Round-trip: експортований CSV імпортується назад з 0 нових дублів |
| FR-IMP-06 | R0 | **Захист від CSV formula injection** при експорті | • Значення, що починаються з `=`, `+`, `-`, `@`, tab або CR, префіксуються `'` (unit-тест) |

## 17. DEMO — ефемерний demo

| ID | R | Вимога | Acceptance criteria |
|---|---|---|---|
| FR-DEMO-01 | R1 | «Try demo» без реєстрації створює **окремого demo-користувача на відвідувача** (`User.demoExpiresAt` заповнено) з синтетичними даними (заявки у всіх статусах, події, reminders, вакансії) | • Кожен відвідувач бачить тільки свої demo-дані (IDOR-тест між двома demo) · • Seed — тільки синтетичні дані |
| FR-DEMO-02 | R1 | TTL 24 год | • Після TTL demo-користувач і всі його дані видаляються cleanup-job-ом |
| FR-DEMO-03 | R1 | Обмеження demo | • Вимкнено: uploads, URL capture (fetch), надсилання email, linking/зміна auth · • Спроба → `403 DEMO_FEATURE_DISABLED` («Not available in demo»), без 500 |
| FR-DEMO-04 | R1 | AI у demo | • Заглушка (фіксовані відповіді) або жорсткий ліміт; глобальний денний ліміт у USD (FR-AI-07) діє |
| FR-DEMO-05 | R1 | Захист від зловживань | • Turnstile і rate limit створення demo на IP; глобальний ліміт одночасних demo-користувачів → дружнє повідомлення (значення — `09-security-privacy.md` §11) |
| FR-DEMO-06 | R1 | Банер «Demo — data resets in N h» + CTA «Request access» | • Банер видно на всіх екранах demo |

## Зміни відносно v2.0

- Усі вимоги отримали ID `FR-<AREA>-NN`, реліз і перевірювані AC.
- P-03: `UserSettings.timezone` у R0 (FR-PROF-01); quiet hours — R1 (FR-PROF-02).
- P-04: визначено активність і stale (§1.1, FR-APP-13/14), `staleDismissedUntil`, GHOSTED тільки користувач.
- P-05: Reminder — джерело, `nextAction*` — кеш; один відкритий follow-up; custom reminders (FR-REM-01/04).
- P-06: CSV preview → commit, мапінг статусів, формат дати, повторний імпорт, backdated events (FR-IMP-01…03).
- P-07: видалення заявок/вакансій, редагування/видалення подій, Undo 10 с (FR-APP-05/12/15, FR-JOB-06).
- P-08: Detail R0 без contacts/interviews/CV (FR-APP-08).
- P-09: синхронний експорт у R0 (FR-IMP-05).
- P-10: R0 — тільки Google OAuth; email+password+reset — R1 (FR-AUTH-01/05/06).
- P-11: URL capture (JSON-LD) — R1; R0 — форма + paste text (FR-JOB-01/02/07).
- P-12: `Job.canonicalUrl` і дедуп за ним (FR-JOB-03/04).
- P-13: визначено «відповідь», funnel за досягнутими стадіями (§1.1, FR-ANL-01/02).
- P-15: onboarding R0 = Import CSV / Add first job (FR-DASH-02).
- P-18: політика capture за доменами (FR-JOB-09).
- P-21: фіксовані множини (Interview kind, origin, channel тощо) — enums (FR-INT-01, FR-APP-01; `05-data-model.md`). P-22: активна заявка = `archivedAt IS NULL`; повторна подача після `REJECTED` — через архівування старої (FR-APP-02). P-23: бекапи — див. `02-releases.md`.
- P-07: undo переходу = DELETE останнього `STATUS_CHANGED` ≤ 15 с (FR-APP-05). Фільтр і сортування за зарплатою в Jobs — R2 (FR-DISC-03/04).
- S-05/S-06/S-07: TTL сесій, re-auth, generic responses, пароль ≥ 12 + HIBP, linking лише з `email_verified`, allowlist у R0 (FR-AUTH-02…10).
- S-10: formula injection і ліміти імпорту (FR-IMP-04/06).
- S-15/P-16: ефемерний demo (FR-DEMO-01…06).
- A-15: перевірка «AI вимкнено» в executor (FR-AI-06).
