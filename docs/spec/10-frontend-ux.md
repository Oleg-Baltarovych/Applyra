# Frontend та UX

> Applyra spec v2.1 · Зона: `apps/web` — навігація, екрани, архітектура SPA, design tokens, доступність · Пов'язані: `02-releases.md`, `03-functional.md`, `06-api.md`, `09-security-privacy.md`, `11-testing.md`

## 1. Навігація по релізах (P-15)

| Реліз | Основна навігація (sidebar; на mobile — bottom bar) | Додатково |
|---|---|---|
| R0 | `Applications · Today · Settings` | Import CSV (з Applications і Settings), Cmd+K (тільки пошук по заявках + «Add application») |
| R1 | `Dashboard · Jobs · Applications · Analytics · Profile (вкл. Documents) · Settings` | дзвіночок Notifications, «Try demo» на sign-in, Cmd+K з jobs |
| R2 | + `Discover` у Jobs (каталог, saved searches) | match-бейджі в Jobs |
| R3 | AI-дії в контексті (Job detail, Application detail), окремого пункту немає | — |

Landing після входу: R0 — `/today` (якщо є due/overdue) інакше `/applications`; R1+ — `/dashboard`.

## 2. Екрани

### 2.1. Маршрути

| Route | Екран | Реліз |
|---|---|---|
| `/sign-in` | Google (R0); email+password, «Try demo» (R1) | R0 |
| `/onboarding` | §3 | R0 |
| `/applications` | Kanban (default), `?view=table` — Table | R0 |
| `/applications/:id` | Detail drawer поверх списку (nested route); на mobile — повна сторінка | R0 |
| `/applications/import` | CSV wizard: upload → mapping → preview → commit (FR-IMP) | R0 |
| `/today` | Today / Overdue / Upcoming (next actions) | R0 |
| `/settings/*` | `account`, `preferences` (timezone, stale thresholds, theme, hotkeys), `data` (export, delete), `sessions` (R1), `ai` (R1), `notifications` (R1) | R0 |
| `/dashboard` | Today, Needs attention, Pipeline, This week | R1 |
| `/jobs`, `/jobs/:id` | фільтри + список; split view ≥ 1280px | R1 |
| `/analytics` | funnel, response rate, канали | R1 |
| `/profile`, `/profile/documents` | Career profile, CV + версії | R1 |
| `/notifications` | in-app центр | R1 |
| `*` | 404 | R0 |

### 2.2. Ключові екрани і component inventory

| Екран | Реліз | Ключове | Компоненти |
|---|---|---|---|
| Add job / application (dialog) | R0: вкладки Manual / Paste text (текст → `description`); R1: + URL з preview чернетки і бейджами джерела полів | кнопка «Save & create application» | `Dialog`, `Tabs`, `JobForm`, `Textarea`, `FieldSourceBadge` (R1), `CapturePreview` (R1) |
| Applications — Kanban | R0 | колонки статусів, термінальні згорнуті; картка: company, role, salary, «N днів без активності» (колір + текст + іконка), next action | `KanbanBoard`, `KanbanColumn`, `ApplicationCard`, `MoveToMenu`, `StatusBadge`, `DaysIdleBadge`, `UndoToast` |
| Applications — Table | R0 | щільна таблиця, inline status select, bulk archive, column visibility, export | TanStack Table, `DataTable`, `StatusSelect`, `BulkActionBar`, `ColumnToggle` |
| Application detail | R0: Overview / Timeline / Notes; R1: + Interviews / Contacts / CV version (P-08) | edit полів, transitions, next action | `Sheet` (drawer), `Tabs`, `ApplicationForm`, `Timeline`, `TimelineEventEditor`, `NextActionPicker`, `NotesEditor` |
| Today | R0 | Overdue (зверху), Today, Upcoming 7 днів; done / snooze / reschedule | `ReminderList`, `ReminderItem`, `SnoozeMenu` |
| CSV import | R0 | 4 кроки, мапінг статусів і формату дати, звіт помилок по рядках | `Stepper`, `FileDropzone`, `ColumnMappingTable`, `ValueMappingTable`, `PreviewTable`, `ImportReport` |
| Settings | R0 | timezone (default — з браузера), `staleFollowUpDays` / `staleDaysAfterInterview` / `staleGhostDays`, тема, `hotkeysEnabled`, export, delete (R1) | `Form`, `Select`, `Switch`, `DangerZone`, `ReauthDialog` (R1) |
| Dashboard | R1 | Today, Needs attention, Pipeline, This week | `StatCard` (tabular-nums), `PipelineBar` (Recharts), `ReminderList` |
| Jobs | R1 | фільтри ліворуч (tablet/mobile — drawer; без зарплатного фільтра — він у R2 з salary normalization), список праворуч | `FilterPanel`, `JobList`, `JobCard`, `JobDetail`, `SafeHtml` |
| Analytics | R1 | funnel за досягнутими стадіями, канали | Recharts `FunnelChart`/`BarChart` + таблична альтернатива |
| Profile / Documents | R1 | досвід, навички (autocomplete), CV upload, версії | `SkillCombobox`, `UploadButton`, `DocumentVersionList` |

## 3. Onboarding

| Реліз | Flow |
|---|---|
| R0 | Перший вхід → timezone з `Intl.DateTimeFormat().resolvedOptions().timeZone` зберігається в `UserSettings` без питань → empty state `/applications` з двома CTA: **«Import CSV»** і **«Add first job»** (manual/paste). Без кроків профілю |
| R1 | 3 кроки (кожен можна пропустити): target role + work mode + salary → skills (top 10) → «Import CSV / Add first job» |
| Demo (R1) | без onboarding; банер «Demo — data resets in N h» + «Request access» (FR-DEMO-06) |

## 4. Архітектура `apps/web`

### 4.1. Структура

```
apps/web/src/
  app/            # router, providers (QueryClient, theme), root layout, error boundary
  features/<feature>/{api,components,hooks,routes}/   # applications, today, imports, settings, jobs (R1)…
    api/keys.ts   # query key factory
    api/*.ts      # queryOptions + mutation hooks
  components/ui/  # shadcn primitives (змінюються тільки tokens/variants)
  components/     # shared composites: SafeHtml, EmptyState, ErrorState, DataTable…
  lib/api/        # typed API client
  lib/hotkeys/    # реєстр хоткеїв
  styles/globals.css
```

Feature імпортує іншу feature тільки через її `index.ts` (ESLint boundaries, як на backend).

### 4.2. Routing — React Router 8, SPA (data mode)

- **Data mode** (`createBrowserRouter` + `RouterProvider`), без SSR і без framework mode: framework mode генерує inline hydration-скрипти, що несумісно зі strict CSP (§9).
- Route modules ліниві (`lazy`) — code splitting per feature.
- `loader` тільки для prefetch: `queryClient.ensureQueryData(xxxQueryOptions)` — дані читаються компонентом через `useQuery` (один кеш).
- Auth gate: root-layout loader `ensureQueryData(sessionQuery)`; 401 → `redirect('/sign-in?next=…')` (`next` — тільки відносний шлях).
- `errorElement` на кожному feature-route → `ErrorState`; 404 від API → екран «Not found» (без розрізнення «чуже/неіснуюче», див. `09-security-privacy.md` §2).
- Стан фільтрів і view — у URL search params (shareable, back/forward працює).

## 5. Server state — TanStack Query

### 5.1. Key factories

```ts
// features/applications/api/keys.ts
export const applicationKeys = {
  all: ['applications'] as const,
  lists: () => [...applicationKeys.all, 'list'] as const,
  list: (q: ApplicationQuery) => [...applicationKeys.lists(), q] as const,
  details: () => [...applicationKeys.all, 'detail'] as const,
  detail: (id: string) => [...applicationKeys.details(), id] as const,
  timeline: (id: string) => [...applicationKeys.detail(id), 'timeline'] as const,
};
```

- Запити оголошуються як `queryOptions(...)` поруч із ключами; компоненти не пишуть ключі руками.
- Дефолти: `staleTime: 30 s`, `gcTime: 5 хв`, `retry`: до 2 разів тільки для network/5xx, ніколи для 4xx; `refetchOnWindowFocus: true` для Today/Dashboard.

### 5.2. Optimistic updates (Kanban transitions)

| Фаза | Дія |
|---|---|
| intent | `idempotencyKey = crypto.randomUUID()` генерується **один раз** на дію користувача і живе у variables мутації (retry використовує той самий ключ) |
| `onMutate` | `cancelQueries(applicationKeys.lists())`; snapshot усіх list-кешів і detail; перенесення картки в `setQueriesData`; return `{ snapshot }` |
| `onError` | rollback зі snapshot; toast з `code` помилки (409 `INVALID_TRANSITION` → пояснення; 409 `CONFLICT_ACTIVE_APPLICATION` → діалог «Archive the old application and create a new one», FR-APP-02) |
| `onSuccess` | показати `UndoToast` (§7.2) |
| `onSettled` | `invalidateQueries` для `lists()`, `detail(id)`, `timeline(id)`, `today` |

Ті самі правила — для inline status select у Table і `MoveToMenu`. Інші мутації — без optimistic, з `invalidateQueries`.

## 6. Client state, форми, API client

### 6.1. Zustand — тільки UI-стан

Дозволено: стан command palette, відкриті панелі/drawer на mobile, вибрані рядки Table (bulk), pending `G`-послідовність хоткеїв. **Заборонено**: копії серверних даних, фільтри (вони в URL), session.

### 6.2. Форми

- React Hook Form + `zodResolver(Schema)`, схеми — тільки з `@applyra/contracts` (без дублювання правил).
- Серверні помилки валідації (400 `VALIDATION_ERROR` з `details: [{ path, message }]`, формат — `06-api.md` §3) мапляться на `setError(path)`; загальні — на `root.serverError`.
- Submit disabled під час `isSubmitting`; unsaved-changes guard (`useBlocker`) на довгих формах.

### 6.3. Typed API client

- `lib/api/client.ts`: єдина функція `request({ method, path, params, query, body, schema, idempotencyKey })` поверх `fetch`; `credentials: 'include'`; base URL `VITE_API_URL` (`https://api.<domain>/api/v1`).
- Body завжди `application/json` (крім CSV multipart — див. `09-security-privacy.md` §3).
- Відповідь парситься response-схемою з contracts: dev/test — `parse` (падає), prod — `safeParse` + репорт у Sentry.
- Помилки → `ApiError { status, code, message, details?, requestId }` (каталог кодів — `06-api.md`). 401 → інвалідація session + redirect; 403 `FRESH_SESSION_REQUIRED` → `ReauthDialog`; 429 → toast «спробуйте пізніше» з `Retry-After`.
- Ad-hoc `fetch` у компонентах заборонено (ESLint `no-restricted-globals` поза `lib/api`).
- Моки — тільки MSW handlers у тестах (`11-testing.md`).

## 7. Стани і зворотний зв'язок

### 7.1. Loading / empty / error

| Стан | Конвенція |
|---|---|
| Loading | skeleton тієї ж форми, що й контент (не spinner на весь екран); показ після 150 ms, щоб не блимав |
| Empty | `EmptyState`: іконка + 1 речення + основний CTA (напр. «Import CSV», «Add first job»); окремий варіант «нічого не знайдено за фільтрами» з «Clear filters» |
| Error | `ErrorState`: повідомлення за `code`, кнопка «Retry» (`refetch`), `requestId` дрібним текстом для репорту |
| Background refetch | тонкий індикатор, контент не ховається |
| Mutation | toast успіху тільки для неочевидних дій; помилки — завжди toast або inline |

### 7.2. Undo (P-07)

- Після transition (drag, `MoveToMenu`, status select), archive, delete — toast «Moved to Interview · **Undo**» на **10 с** (пауза при hover/focus, `role="status"`).
- Undo transition = `DELETE /applications/:id/events/:eventId` останнього `STATUS_CHANGED` (сервер приймає ≤ 15 с, далі `409 CONFLICT_STATE`); undo archive = `unarchive`; undo delete — клієнт відкладає `DELETE` на 10 с (FR-APP-05/12, `06-api.md` §7.3). Стан повертається оптимістично.
- Undo доступний з клавіатури: фокус не переноситься автоматично, але `Ctrl/⌘+Z` протягом 10 с (якщо фокус не в полі вводу) виконує Undo.

## 8. Design tokens

- Tailwind v4 + shadcn: CSS variables у `styles/globals.css` (`:root` — light, `.dark` — dark) + `@theme inline` мапить їх у утиліти. Hex-кольори в компонентах заборонені (lint).
- Тема: `system` (default) / `light` / `dark`, перемикач у Settings; клас `.dark` ставить зовнішній `/theme-init.js` (sync у `<head>`, не inline — CSP).

| Token | Light | Dark |
|---|---|---|
| `--background` | white | slate-950 |
| `--foreground` | slate-900 | slate-50 |
| `--card` / `--popover` | white | slate-900 |
| `--muted` (Surface Secondary) | slate-100 | slate-800 |
| `--muted-foreground` (Text Secondary) | slate-600 (не slate-500: < 4.5:1 на slate-100) | slate-400 |
| `--border` / `--input` | slate-200 | slate-800 |
| `--primary` | indigo-600 | indigo-400 |
| `--primary-foreground` | white | indigo-950 |
| `--ring` | indigo-500 | indigo-400 |
| `--destructive` | red-600 | red-400 |
| `--status-{active,interview,offer,rejected,ghosted,archived}` | 6 відтінків + іконка на кожен статус | ті самі, підібрані під dark |
| `--radius` | 0.5rem | — |

- Типографіка: Inter Variable self-hosted (`@fontsource-variable/inter`, без Google Fonts — CSP `font-src 'self'`); зарплати, лічильники, дати в таблицях — `tabular-nums`.
- Контраст AA: текст ≥ 4.5:1, великий текст і UI-компоненти/фокус ≥ 3:1. Перевірка автоматична: `scripts/check-contrast.ts` рахує пари токенів (foreground/background, muted-foreground/muted, primary-foreground/primary, status/background) в обох темах — у CI; плюс axe у компонентних і e2e тестах (`11-testing.md`).

## 9. CSP-сумісність і `SafeHtml`

| Правило | Причина |
|---|---|
| Жодних inline `<script>` / `on*=` у `index.html` і JSX-рядках; `javascript:` URL заборонені | `script-src 'self'` (див. `09-security-privacy.md` §9) |
| Без `eval`/`new Function` (у т.ч. в залежностях — перевіряється CSP у e2e) | без `'unsafe-eval'` |
| Шрифти, іконки (lucide), зображення — з бандла | `font-src`/`img-src 'self'` |
| Сторонні скрипти — тільки Sentry (у бандлі) і Turnstile (тільки на demo-екрані) | allowlist CSP |
| Theme init — зовнішній `/theme-init.js` | без inline |

**`SafeHtml`** (`components/SafeHtml.tsx`) — **єдине** місце з `dangerouslySetInnerHTML` (ESLint `react/no-danger: error` з винятком тільки для цього файлу):
- приймає тільки branded тип `SanitizedHtml` з contracts (сервер санітизує на запис, `09-security-privacy.md` §7); звичайний `string` не компілюється;
- рендерить у контейнер з `prose`-стилями; посилання вже мають `rel`/`target` з сервера;
- AI-вивід і нотатки рендеряться як текст, не через `SafeHtml` (див. `07-ai.md`).

## 10. Доступність — WCAG 2.2 AA

### 10.1. Базові вимоги

- Усе доступне з клавіатури; видимий focus ring (`--ring`, ≥ 3:1, не прихований sticky-елементами — 2.4.11).
- Статус ніколи тільки кольором: іконка + текст (`StatusBadge`, `DaysIdleBadge`).
- Контроли з label; іконкові кнопки з `aria-label`; діалоги з focus trap і поверненням фокусу.
- `prefers-reduced-motion`: без анімацій перенесення карток і skeleton-pulse.
- Target size ≥ 24×24 px (2.5.8); на touch — 44×44.
- Live region (`aria-live="polite"`) для результатів drag, Undo, імпорту.
- Recharts-графіки мають табличну альтернативу («Show as table»).

### 10.2. Drag і альтернативи (P-14, 2.5.7)

| Спосіб | Як |
|---|---|
| Mouse/touch drag | dnd-kit pointer/touch sensors |
| Клавіатура | dnd-kit keyboard sensor: `Space` — взяти, стрілки — колонка/позиція, `Space` — покласти, `Esc` — скасувати; оголошення через `announcements` |
| Без drag (2.5.7) | `MoveToMenu` на кожній картці: кнопка «⋯» / контекстне меню / `M` при фокусі на картці → список статусів → той самий transition-мутація |

### 10.3. Хоткеї (P-14, 2.1.4)

| Клавіша | Дія | Реліз |
|---|---|---|
| `⌘/Ctrl + K` | command palette | R0 |
| `C` | create application | R0 |
| `N` | new job (Add job dialog, FR-JOB-01) | R0 |
| `/` | фокус на пошук поточного списку | R0 |
| `M` | Move to… (фокус на картці/рядку) | R0 |
| `G` → `A` / `T` / `S` | Applications / Today / Settings | R0 |
| `G` → `D` / `J` / `P` / `Y` | Dashboard / Jobs / Profile / Analytics | R1 |
| `?` | довідка по хоткеях | R0 |

- Конфлікт v2.0 (`A` = add application vs `G then A`) усунено: одноклавішні дії не використовують літери, що є другим кроком `G`-послідовностей у тому ж контексті; `G` відкриває послідовність на 1 с, у цей час одноклавішні дії не спрацьовують.
- Одноклавішні хоткеї активні **тільки коли фокус не в `input`/`textarea`/`select`/`[contenteditable]`** і не відкритий діалог/меню.
- Settings → Preferences: «Keyboard shortcuts» (on/off) вимикає всі одноклавішні хоткеї (модифікаторні `⌘K` лишаються). Зберігається на сервері в `UserSettings.hotkeysEnabled` (`PATCH /me/settings`), діє на всіх пристроях.
- Хоткеї оголошуються в одному реєстрі (`lib/hotkeys`), з якого генерується довідка `?` і Cmd+K.

## 11. Responsive

| Breakpoint | Поведінка |
|---|---|
| < 768px (mobile) | bottom nav; Kanban → **згрупований список** (секції за статусом, згортаються; термінальні згорнуті), зміна статусу — `MoveToMenu` у bottom sheet; Table → список карток; Detail → повна сторінка; фільтри — drawer |
| 768–1279px (tablet) | sidebar згорнутий в іконки; Kanban з горизонтальним скролом колонок (scroll-snap); Detail — drawer на всю висоту; фільтри Jobs — drawer |
| ≥ 1280px (desktop) | повний sidebar; Jobs split view; Detail — drawer 480–560px поверх Kanban |

- Desktop-first, але кожен R0-екран перевіряється на 375px (e2e viewport у `11-testing.md`).
- Без горизонтального скролу сторінки (крім Kanban-контейнера на tablet); reflow при 320 CSS px (1.4.10).

## Зміни відносно v2.0

- P-15 — навігація R0 = Applications · Today · Settings; onboarding R0 = Import CSV / Add first job.
- P-08 — Detail у R0 без Contacts/Interviews/CV.
- P-14 — 2.5.7 `MoveToMenu` як альтернатива drag; 2.1.4 хоткеї тільки поза полями вводу + серверний вимикач `hotkeysEnabled`; конфлікт `A` vs `G then A` усунено (`C` = create application).
- P-07 — Undo toast 10 с для transitions/archive/delete.
- S-11 — CSP-сумісний frontend (без inline-скриптів, theme-init зовнішнім файлом), `SafeHtml` як єдиний `dangerouslySetInnerHTML` з branded `SanitizedHtml`.
- AI-01 — без remote images у санітизованому HTML і AI-виводі.
- Нове — архітектура `apps/web`: feature folders, React Router 8 data mode (SPA), key factories, optimistic updates з rollback, межі Zustand, typed API client, конвенції станів, таблиця design tokens з AA-перевіркою, routes і component inventory по релізах, responsive-правила.
