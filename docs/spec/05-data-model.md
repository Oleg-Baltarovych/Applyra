# Модель даних

> Applyra spec v2.1 · Зона: принципи даних, Prisma 7 schema, FK/каскади, raw SQL, retention-колонки · Пов'язані: `04-architecture.md`, `06-api.md`, `08-ingestion-matching.md`, `09-security-privacy.md`, `11-testing.md`, `12-infra-ops.md`

Алгоритми, що працюють поверх цих таблиць (matching, salary normalization, дедуп), описані в `08-ingestion-matching.md`. Політика зберігання та видалення описана в `09-security-privacy.md`. Тут зафіксовано лише колонки й механізми, на яких ця політика тримається.

## 1. Принципи

| # | Правило |
|---|---|
| D-1 | PK — UUID v7, `@db.Uuid`, `@default(dbgenerated("uuidv7()"))` (вбудована функція PostgreSQL 18, extension не потрібен). Better Auth генерує id у застосунку тією ж версією v7 (§2.3). |
| D-2 | Усі `DateTime` мають тип `@db.Timestamptz(3)` і зберігаються в UTC. Timezone користувача — тільки `UserSettings.timezone` (IANA). Дати без часу (`startDate`, `ExchangeRate.date`) мають тип `@db.Date`. |
| D-3 | Кожна користувацька таблиця має `userId` з FK на `User` (`onDelete: Cascade`). Кожен запит фільтрує за `userId` через репозиторний хелпер `findOwned(userId, id)`. Приватні `Job` фільтруються за `ownerId` через окремий хелпер `findAccessibleJob(userId, id)`: `id = $id AND (visibility = 'PUBLIC' OR ownerId = $userId)` (A-09). IDOR-тести — див. `11-testing.md`. |
| D-4 | Будь-яка фіксована множина значень оголошується як Prisma `enum`, який дзеркалиться в `packages/contracts` (A-12). `String` для таких полів дозволено лише з коментарем «чому не enum». |
| D-5 | JSONB використовується лише для payload подій, сирих даних джерел, matching breakdown, мапінгу імпорту, збережених відповідей idempotency і typed config. Кожен JSONB має Zod-схему в `contracts` (назва схеми вказана в коментарі поля). |
| D-6 | Гроші зберігаються як `Int` (цілі одиниці валюти) + `currency CHAR(3)` (ISO 4217) + `SalaryPeriod`. Нормалізовані значення `*UsdMonth` обчислюються (`08-ingestion-matching.md`). |
| D-7 | Кожен FK має явний `onDelete` (§5). Неявних `NoAction` немає. |
| D-8 | Усі індекси, зокрема partial, GIN і trigram, оголошуються в `schema.prisma`. Raw SQL використовується тільки для того, чого Prisma не вміє виразити (§7), щоб `migrate diff` не бачив drift (A-10). |
| D-9 | Snapshot-поля (`Application.companyName`, `roleTitle`) залишаються після видалення пов'язаної сутності (FK `SetNull`). |
| D-10 | Таблиці й колонки названі за замовчуванням Prisma (PascalCase-таблиці, camelCase-колонки, у raw SQL беруться в лапки). `@map` використано лише для `search_vector`. |

## 2. Prisma 7: конфігурація

### 2.1. `prisma.config.ts`

У Prisma 7 `url` у блоці `datasource` схеми не задається: URL підключення, шлях до схеми й міграцій та shadow DB живуть у `prisma.config.ts`. `.env` автоматично не завантажується, тому файл починається з `import "dotenv/config"`.

```ts
// apps/api/prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? "",
  },
});
```

Runtime-клієнт підключається через driver adapter `@prisma/adapter-pg`: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.

### 2.2. Generator і datasource

- `provider = "prisma-client"` (новий генератор): `output` обов'язковий — `apps/api/src/platform/prisma/generated` (на цей шлях спирається ESLint-правило 4, `04-architecture.md` §4.1); `moduleFormat = "esm"`, бо api — ESM (M0-02).
- `previewFeatures = ["partialIndexes"]` (Prisma ≥ 7.4) вмикає `where:` в `@@index`/`@@unique`. Без цього прапорця partial-індекси довелося б тримати в raw SQL, і Migrate бачив би їх як drift. Версію Prisma пінимо на `7.x ≥ 7.4` (див. `04-architecture.md` §7).
- Trigram-індекси оголошуються як `@@index([col(ops: raw("gin_trgm_ops"))], type: Gin)`. Документація Prisma не наводить прикладу саме з `gin_trgm_ops`, тому синтаксис перевіряється першою міграцією та `migrate diff` у CI (§9).

### 2.3. Better Auth

Таблиці `User`, `Session`, `Account` і `Verification` мають core-поля Better Auth. Генерація id налаштовується так:

```ts
// apps/api/src/modules/auth/auth.config.ts (фрагмент)
import { v7 as uuidv7 } from "uuid";
betterAuth({
  advanced: { database: { generateId: () => uuidv7() } }, // UUID v7 узгоджено з @db.Uuid доменних FK (A-02)
  user: {
    additionalFields: {
      role:      { type: ["USER", "ADMIN"], required: false, defaultValue: "USER", input: false },
      deletedAt: { type: "date", required: false, input: false },
      demoExpiresAt: { type: "date", required: false, input: false }, // R1 · demo ⇔ NOT NULL (§4.7)
    },
  },
  session: { freshAge: 60 * 10 }, // «fresh session» ≤ 10 хв для DELETE /me, POST /me/export (S-05)
});
```

- `input: false`: роль, `deletedAt` і `demoExpiresAt` не можна задати через API реєстрації чи профіль OAuth-провайдера.
- Після `npx auth generate` схему звіряють з цим файлом, але джерелом правди лишається `schema.prisma` нижче.
- `Account.accessToken`, `refreshToken` і `idToken` після входу не потрібні (R0 — тільки Google sign-in). Політику їх зберігання й шифрування визначає `09-security-privacy.md`.

## 3. Моделі за релізами

| Реліз | Модулі | Моделі |
|---|---|---|
| **R0** | auth, users, jobs, applications, reminders, import-export | `User`, `Session`, `Account`, `Verification`, `UserSettings`, `Job` (тільки `PRIVATE`), `Application`, `ApplicationEvent`, `Reminder`, `ImportSession`, `IdempotencyRecord` |
| **R1** | + profile, skills, documents, notifications, analytics, outbox, audit, ai | `Company`, `UserJob`, `ReminderDelivery`, `Interview`, `Contact`, `ApplicationContact`*, `CareerProfile`, `Experience`, `Education`*, `Language`, `Skill`, `SkillAlias`, `UserSkill`, `Document`, `DocumentVersion`, `DataExport`, `Notification`, `NotificationPreference`*, `AiRun`, `AiUsageDaily`, `AiGlobalUsageDaily`*, `DeletedUserTombstone`*, `OutboxEvent`, `AuditLog` |
| **R2** | + ingestion, matching | `JobSource`, `SourceJob`, `JobSkill`, `SavedSearch`, `MatchScore`, `MatchFeedback`, `ExchangeRate` |
| **R3** | ai (semantic) | `JobEmbedding`* |

\* Моделей немає в базовому списку v2.1. Їх додано з такими причинами: `ApplicationContact` — m2m заявка↔контакт для `POST /applications/:id/contacts` (A-17). `Education` — FR профілю (`03-functional.md`, FR-PROF). `NotificationPreference` — налаштування тип × канал. `AiGlobalUsageDaily` — глобальні AI caps (07). `DeletedUserTombstone` — повторне видалення після restore (09). `JobEmbedding` — pgvector (R3).

Перейменування відносно v2.0: `WorkExperience` → `Experience`, `UserLanguage` → `Language`, `MatchResult` → `MatchScore`. `Document` розділено на `Document` + `DocumentVersion` (A-20).

R0-схема — це блоки §4.1 та §4.2 **без позначених елементів**. Правило: кожне поле, relation, back-relation, індекс чи enum, прив'язане до пізнішого релізу, має маркер `// R1` / `// R2` / `// R3` (під маркером `// R1+` — усі рядки до кінця блоку) і додається міграцією, що вводить модель/функцію цього релізу. R0-міграція містить лише непозначені елементи; значення enum-ів з блоку R0 створюються повністю (без `ALTER TYPE` пізніше). Те саме стосується таблиці FK §5 і raw SQL §7 (теги релізу в заголовках/рядках).

## 4. `schema.prisma`

Файл один: `apps/api/prisma/schema.prisma`. Нижче він розбитий на блоки за релізами в тому порядку, в якому блоки йдуть у файлі.

### 4.1. Generator, datasource, enums

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../src/platform/prisma/generated"
  moduleFormat    = "esm"
  previewFeatures = ["partialIndexes"]
}

datasource db {
  provider = "postgresql" // url — у prisma.config.ts (Prisma 7)
}

// ---------- R0 ----------
// Enums тут записано в один рядок для стислості; Prisma такий синтаксис НЕ приймає (P1012, M0-03) —
// у schema.prisma кожне значення на окремому рядку.
enum Role               { USER ADMIN }
enum WorkMode           { REMOTE HYBRID ONSITE }
enum EmploymentType     { FULL_TIME PART_TIME CONTRACT FREELANCE INTERNSHIP }
enum Seniority          { INTERN JUNIOR MIDDLE SENIOR LEAD PRINCIPAL }
enum SalaryPeriod       { HOUR DAY WEEK MONTH YEAR }   // DAY/WEEK — нормалізація salary (08 §7.3)
enum CefrLevel          { A1 A2 B1 B2 C1 C2 NATIVE }
enum JobVisibility      { PUBLIC PRIVATE }
enum JobStatus          { OPEN CLOSED UNKNOWN }
enum ExtractionMethod   { ADAPTER JSON_LD LLM MANUAL }
enum ApplicationStatus  { WISHLIST APPLIED SCREENING INTERVIEW TEST_TASK OFFER ACCEPTED REJECTED WITHDRAWN GHOSTED }
enum ApplicationOrigin  { SELF_APPLIED RECRUITER_OUTREACH REFERRAL OTHER }
enum ApplicationChannel { DJINNI DOU LINKEDIN EMAIL TELEGRAM COMPANY_SITE OTHER }
enum Priority           { HIGH NORMAL LOW }
enum ApplicationEventType {
  CREATED STATUS_CHANGED NOTE MESSAGE_LOGGED FOLLOW_UP_SENT
  INTERVIEW_SCHEDULED INTERVIEW_COMPLETED OFFER_RECEIVED ARCHIVED UNARCHIVED
}
enum EventActor         { USER IMPORT SYSTEM }        // activity (P-04, 03 §1.1) = USER + IMPORT; SYSTEM — ні
enum ReminderKind       { FOLLOW_UP INTERVIEW DEADLINE CUSTOM }
enum ReminderSource     { NEXT_ACTION INTERVIEW_AUTO MANUAL }   // A-05
enum ReminderStatus     { PENDING DONE CANCELLED }    // snooze = новий dueAt, статус лишається PENDING
enum NotificationChannel { IN_APP EMAIL TELEGRAM }
enum ImportStatus       { PREVIEWED COMMITTED EXPIRED FAILED }
enum AiProfilePart      { SUMMARY EXPERIENCE SKILLS LANGUAGES PREFERENCES DOCUMENTS } // R1 (UserSettings.aiAllowedProfileParts)

// ---------- R1 ----------
enum JobHiddenReason    { NOT_RELEVANT SALARY LOCATION SENIORITY COMPANY DUPLICATE OTHER }
enum SkillCategory      { LANGUAGE FRAMEWORK DATABASE CLOUD TOOL PRACTICE OTHER }
enum SkillPreference    { PREFERRED NEUTRAL AVOID }
enum DocumentKind       { CV COVER_LETTER OTHER }
enum DocumentStatus     { PENDING READY REJECTED }   // PENDING = у карантині до валідації (S-08)
enum ParseStatus        { PENDING DONE FAILED SKIPPED }
enum InterviewKind      { RECRUITER_SCREEN TECHNICAL SYSTEM_DESIGN BEHAVIORAL TEST_TASK_REVIEW FINAL OTHER }
enum InterviewOutcome   { PENDING PASSED FAILED UNKNOWN }
enum ContactRole        { RECRUITER HIRING_MANAGER REFERRER OTHER }
enum DeliveryStatus     { PENDING SENT FAILED SKIPPED }
enum NotificationType   { REMINDER_DUE INTERVIEW_SOON STALE_APPLICATION SAVED_SEARCH_RESULTS EXPORT_READY IMPORT_DONE }
enum NotificationMode   { INSTANT DIGEST }
enum ExportStatus       { PENDING RUNNING READY FAILED EXPIRED }
enum AiTask             { EXTRACT_JOB ANALYZE_JOB TAILOR_CV DRAFT_MESSAGE RECRUITER_REPLY INTERVIEW_PREP PARSE_CV }
enum AiRunStatus        { OK CACHED INVALID_OUTPUT ERROR BUDGET_EXCEEDED DISABLED }
enum DomainEventType {
  APPLICATION_STATUS_CHANGED JOB_CREATED JOB_UPDATED PROFILE_UPDATED
  DOCUMENT_UPLOADED DOCUMENT_DELETED DATA_EXPORT_REQUESTED USER_DELETION_REQUESTED IMPORT_COMMITTED
  SAVED_SEARCH_MATCHED // R2
} // каталог подій і consumers — 04-architecture.md §5.3 (1:1 з цим enum)
enum AiUsageScope       { ALL DEMO }                  // глобальні caps (07-ai.md §4.2)
enum AuditAction {
  SIGN_IN_SUCCEEDED SIGN_IN_FAILED SIGN_OUT SESSION_REVOKED SESSIONS_REVOKED
  PASSWORD_CHANGED PASSWORD_RESET_REQUESTED PASSWORD_RESET_COMPLETED
  ACCOUNT_LINKED ACCOUNT_UNLINKED EMAIL_CHANGED TOTP_ENABLED TOTP_DISABLED
  DATA_EXPORT_REQUESTED DATA_EXPORT_DOWNLOADED ACCOUNT_DELETE_REQUESTED ACCOUNT_DELETED
  DOCUMENT_DOWNLOADED DOCUMENT_DELETED IMPORT_COMMITTED AI_SETTINGS_CHANGED
  TELEGRAM_CONNECTED TELEGRAM_DISCONNECTED ADMIN_ACCESS ADMIN_ACTION ROLE_CHANGED DEMO_CREATED
} // семантика і перелік — 09-security-privacy.md §13 (S-14), 1:1

// ---------- R2 ----------
enum JobSourceKind      { API RSS MANUAL CAPTURE EXTENSION }
enum LinkMethod         { EXTERNAL_ID URL FINGERPRINT SIMILARITY MANUAL }
enum SkillImportance    { REQUIRED NICE_TO_HAVE }
enum JobSkillSource     { DICTIONARY LLM MANUAL ADAPTER }
enum SavedSearchNotify  { NONE DAILY WEEKLY }
enum MatchExclusion     { WORK_MODE SALARY COUNTRY EMPLOYMENT_TYPE EXCLUDED_COMPANY }
enum MatchFeedbackKind  {
  GOOD_MATCH NOT_RELEVANT SALARY_TOO_LOW WRONG_SENIORITY WRONG_LOCATION MISSING_SKILL NOT_INTERESTED_COMPANY
}
```

### 4.2. R0: auth, settings, jobs, applications, reminders, import, idempotency

```prisma
/// R0 · Better Auth core + additionalFields (role, deletedAt)
model User {
  id            String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          Role      @default(USER)
  deletedAt     DateTime? @db.Timestamptz(3)   // soft delete → hard delete ≤ 24 год (09)
  demoExpiresAt DateTime? @db.Timestamptz(3)   // R1 · ефемерний demo-користувач, TTL 24 год (не з базового списку — рішення §4.7)
  createdAt     DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime  @updatedAt @db.Timestamptz(3)

  sessions           Session[]
  accounts           Account[]
  settings           UserSettings?
  ownedJobs          Job[]
  applications       Application[]
  applicationEvents  ApplicationEvent[]
  reminders          Reminder[]
  importSessions     ImportSession[]
  idempotencyRecords IdempotencyRecord[]
  // R1+
  userJobs           UserJob[]
  interviews         Interview[]
  contacts           Contact[]
  careerProfile      CareerProfile?
  experiences        Experience[]
  educations         Education[]
  languages          Language[]
  userSkills         UserSkill[]
  documents          Document[]
  documentVersions   DocumentVersion[]
  dataExports        DataExport[]
  notifications      Notification[]
  notificationPrefs  NotificationPreference[]
  aiRuns             AiRun[]
  aiUsageDaily       AiUsageDaily[]
  auditLogs          AuditLog[]
  savedSearches      SavedSearch[]
  matchScores        MatchScore[]
  matchFeedback      MatchFeedback[]

  @@index([deletedAt])
  @@index([demoExpiresAt]) // R1
}

/// R0 · Better Auth
model Session {
  id        String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  token     String   @unique
  expiresAt DateTime @db.Timestamptz(3)
  ipAddress String?                              // PII → retention §8
  userAgent String?
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  @@index([userId])
  @@index([expiresAt])
}

/// R0 · Better Auth (R0: providerId = "google"; "credential" — R1)
model Account {
  id                    String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  accountId             String
  providerId            String
  userId                String    @db.Uuid
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime? @db.Timestamptz(3)
  refreshTokenExpiresAt DateTime? @db.Timestamptz(3)
  scope                 String?
  password              String?                  // hash; R1 (email+password)
  createdAt             DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime  @updatedAt @db.Timestamptz(3)

  @@unique([providerId, accountId])
  @@index([userId])
}

/// R0 · Better Auth (OAuth state; R1 — email verification, reset)
model Verification {
  id         String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  identifier String
  value      String
  expiresAt  DateTime @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime @updatedAt @db.Timestamptz(3)

  @@index([identifier])
  @@index([expiresAt])
}

/// R0 (поля R1 позначені) · A-06, P-03
model UserSettings {
  userId                  String          @id @db.Uuid
  user                    User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  timezone                String          @default("UTC")   // IANA; з браузера при першому вході. Єдине джерело TZ
  staleFollowUpDays       Int             @default(7)       // APPLIED/SCREENING без активності → підказка «Follow up»
  staleDaysAfterInterview Int             @default(10)      // INTERVIEW/TEST_TASK без активності → «Follow up»
  staleGhostDays          Int             @default(21)      // підказка «Mark as ghosted?» (тільки користувач ставить)
  hotkeysEnabled          Boolean         @default(true)    // WCAG 2.1.4 (P-14); серверний вимикач (не localStorage)
  quietHoursStart         Int?                              // R1 · хвилини від 00:00 local, 0..1439
  quietHoursEnd           Int?                              // R1
  aiEnabled               Boolean         @default(false)   // R1 · opt-in
  aiAllowedProfileParts   AiProfilePart[] @default([])      // R1
  updatedAt               DateTime        @updatedAt @db.Timestamptz(3)
}

/// R0 (PRIVATE, ручна форма) · R1 (каталог, FTS) · R2 (PUBLIC з ingestion)
model Job {
  id                String           @id @default(dbgenerated("uuidv7()")) @db.Uuid
  visibility        JobVisibility
  ownerId           String?          @db.Uuid    // NOT NULL ⇔ PRIVATE (CHECK §7.4)
  owner             User?            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  companyId         String?          @db.Uuid    // R1; private capture тільки лінкує існуючу Company, не створює
  company           Company?         @relation(fields: [companyId], references: [id], onDelete: SetNull) // R1
  companyNameRaw    String
  title             String
  normalizedTitle   String                       // lower + f_unaccent, обчислюється на запис
  descriptionText   String                       // R0: вставлений текст
  descriptionHtml   String?                      // sanitize-html на запис (09)
  locationText      String?
  countryCode       String?          @db.Char(2)
  workMode          WorkMode?
  employmentType    EmploymentType?
  seniority         Seniority?
  englishLevel      CefrLevel?
  salaryMin         Int?
  salaryMax         Int?
  salaryCurrency    String?          @db.Char(3)
  salaryPeriod      SalaryPeriod?
  salaryIsGross     Boolean?
  salaryMinUsdMonth Int?                         // R2 · 08-ingestion-matching.md (null до R2)
  salaryMaxUsdMonth Int?                         // R2
  salaryFxDate      DateTime?        @db.Date    // R2 · дата курсу НБУ, використаного для *UsdMonth (08 §7.3, ADR 019)
  originalUrl       String?                      // як ввів користувач
  canonicalUrl      String?                      // без utm/trailing slash, нормалізований host (A-08)
  status            JobStatus        @default(OPEN)
  extractionMethod  ExtractionMethod @default(MANUAL)
  dedupKey          String?                      // R2 fingerprint (08)
  publishedAt       DateTime?        @db.Timestamptz(3)
  firstSeenAt       DateTime         @default(now()) @db.Timestamptz(3)
  lastSeenAt        DateTime         @default(now()) @db.Timestamptz(3)
  closedAt          DateTime?        @db.Timestamptz(3)
  searchVector      Unsupported("tsvector")? @default(dbgenerated()) @map("search_vector") // R1 · GENERATED STORED (§7.3); default — проти drift
  createdAt         DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime         @updatedAt @db.Timestamptz(3)

  applications Application[]
  userJobs     UserJob[]       // R1
  sourceJobs   SourceJob[]     // R2
  skills       JobSkill[]      // R2
  matchScores  MatchScore[]    // R2
  feedback     MatchFeedback[] // R2
  embeddings   JobEmbedding[]  // R3

  @@unique([ownerId, canonicalUrl], where: raw("visibility = 'PRIVATE'"), map: "job_owner_canonical_url_private_uq") // A-08/P-12
  @@index([ownerId, createdAt])                                   // A-09
  @@index([visibility, status, publishedAt(sort: Desc)])          // R1 (каталог)
  @@index([canonicalUrl])                                         // R2 · capture-дедуп проти PUBLIC
  @@index([dedupKey])                                             // R2
  @@index([companyId])                                            // R1
  @@index([searchVector], type: Gin, map: "job_search_gin")       // R1
  @@index([normalizedTitle(ops: raw("gin_trgm_ops"))], type: Gin, map: "job_title_trgm") // R1
}

/// R0 · CRM
model Application {
  id                  String             @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId              String             @db.Uuid
  user                User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId               String?            @db.Uuid
  job                 Job?               @relation(fields: [jobId], references: [id], onDelete: SetNull)
  companyName         String                               // snapshot; єдине джерело, якщо jobId = null
  roleTitle           String                               // snapshot
  origin              ApplicationOrigin  @default(SELF_APPLIED)
  channel             ApplicationChannel?
  status              ApplicationStatus  @default(WISHLIST)
  priority            Priority           @default(NORMAL)
  appliedAt           DateTime?          @db.Timestamptz(3)
  lastActivityAt      DateTime           @default(now()) @db.Timestamptz(3) // P-04, §6.3
  staleDismissedUntil DateTime?          @db.Timestamptz(3) // P-04: «не нагадувати до»
  nextActionText      String?                              // кеш активного Reminder(NEXT_ACTION), P-05
  nextActionAt        DateTime?          @db.Timestamptz(3) // кеш
  salaryExpected      Int?
  salaryOffered       Int?
  salaryCurrency      String?            @db.Char(3)
  salaryPeriod        SalaryPeriod?                        // A-22
  cvDocumentVersionId String?            @db.Uuid          // R1
  cvDocumentVersion   DocumentVersion?   @relation(fields: [cvDocumentVersionId], references: [id], onDelete: SetNull) // R1
  coverLetter         String?                              // R1
  notes               String?                              // markdown
  importKey           String?                              // P-06: sha256(norm company|norm role|appliedAt::date)
  archivedAt          DateTime?          @db.Timestamptz(3)
  createdAt           DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt           DateTime           @updatedAt @db.Timestamptz(3)

  events     ApplicationEvent[]
  reminders  Reminder[]
  interviews Interview[]          // R1
  contacts   ApplicationContact[] // R1

  @@unique([userId, jobId], where: raw("\"jobId\" IS NOT NULL AND \"archivedAt\" IS NULL"), map: "application_user_job_active_uq") // P-22, §6.1
  @@unique([userId, importKey], map: "application_user_import_key_uq") // NULL-и не конфліктують
  @@index([userId, status, updatedAt(sort: Desc)])
  @@index([userId, nextActionAt])
  @@index([userId, lastActivityAt])
  @@index([userId, createdAt])
  @@index([jobId])
  @@index([cvDocumentVersionId]) // R1
}

/// R0 · timeline (append-mostly; редагування — див. 06-api.md)
model ApplicationEvent {
  id            String               @id @default(dbgenerated("uuidv7()")) @db.Uuid
  applicationId String               @db.Uuid
  application   Application          @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  userId        String               @db.Uuid
  user          User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  type          ApplicationEventType
  actor         EventActor           @default(USER)
  fromStatus    ApplicationStatus?
  toStatus      ApplicationStatus?
  payload       Json?                // Zod: ApplicationEventPayload (discriminated by type)
  occurredAt    DateTime             @db.Timestamptz(3)  // може бути в минулому (backdated)
  editedAt      DateTime?            @db.Timestamptz(3)
  createdAt     DateTime             @default(now()) @db.Timestamptz(3)

  @@index([applicationId, occurredAt])
  @@index([userId, type, occurredAt])
}

/// R0 (in-app, рахується при читанні) · R1 (доставка через ReminderDelivery)
model Reminder {
  id            String                @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId        String                @db.Uuid
  user          User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  applicationId String?               @db.Uuid
  application   Application?          @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  interviewId   String?               @db.Uuid    // R1
  interview     Interview?            @relation(fields: [interviewId], references: [id], onDelete: Cascade) // R1
  source        ReminderSource                    // A-05
  kind          ReminderKind
  title         String
  dueAt         DateTime              @db.Timestamptz(3)
  status        ReminderStatus        @default(PENDING)
  snoozeCount   Int                   @default(0)
  channels      NotificationChannel[] @default([IN_APP])
  completedAt   DateTime?             @db.Timestamptz(3)
  createdAt     DateTime              @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime              @updatedAt @db.Timestamptz(3)

  deliveries ReminderDelivery[]   // R1

  @@unique([applicationId, source], where: raw("source = 'NEXT_ACTION' AND status = 'PENDING'"), map: "reminder_next_action_active_uq") // P-05
  @@index([userId, status, dueAt])
  @@index([status, dueAt])
  @@index([interviewId]) // R1
}

/// R0 · CSV preview → commit (P-06)
model ImportSession {
  id           String       @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId       String       @db.Uuid
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  status       ImportStatus @default(PREVIEWED)
  fileName     String
  fileSha256   String
  rowCount     Int
  rows         Json?        // Zod: ImportRows — сирі рядки; очищається на commit/expiry (§8)
  mapping      Json         // Zod: ImportMapping {columns, statusValues, dateFormat, timezone}
  report       Json?        // Zod: ImportReport {created, skippedDuplicates, errors[{row, field, message}]}
  committedAt  DateTime?    @db.Timestamptz(3)
  expiresAt    DateTime     @db.Timestamptz(3)  // createdAt + 24 год
  createdAt    DateTime     @default(now()) @db.Timestamptz(3)

  @@index([userId, createdAt])
  @@index([expiresAt])
}

/// R0 · Idempotency-Key (A-07, S-18): семантика — 06-api.md §4
model IdempotencyRecord {
  id           String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId       String   @db.Uuid
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  key          String   @db.VarChar(128)
  route        String                       // "POST /applications/:id/transitions"
  requestHash  String                       // sha256(canonical JSON body + path params)
  statusCode   Int
  responseJson Json                         // збережена відповідь для replay
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  expiresAt    DateTime @db.Timestamptz(3)  // createdAt + 24 год

  @@unique([userId, key])
  @@index([expiresAt])
}
```

### 4.3. R1: companies, profile, skills, documents, interviews, contacts, notifications, platform

```prisma
/// R1 · глобальна таблиця (модуль jobs, A-23); рядки створює ingestion/admin
model Company {
  id             String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  name           String
  normalizedName String                 // lower, без "LLC/Inc/ТОВ", f_unaccent
  domain         String?  @unique
  logoUrl        String?
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)
  jobs           Job[]

  @@index([normalizedName])
  @@index([normalizedName(ops: raw("gin_trgm_ops"))], type: Gin, map: "company_name_trgm")
}

/// R1 · A-21: незалежні мітки замість одного enum
model UserJob {
  userId       String           @db.Uuid
  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId        String           @db.Uuid
  job          Job              @relation(fields: [jobId], references: [id], onDelete: Cascade)
  savedAt      DateTime?        @db.Timestamptz(3)
  hiddenAt     DateTime?        @db.Timestamptz(3)
  hiddenReason JobHiddenReason?
  viewedAt     DateTime?        @db.Timestamptz(3)
  note         String?
  createdAt    DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime         @updatedAt @db.Timestamptz(3)

  @@id([userId, jobId])
  @@index([userId, savedAt])
  @@index([userId, hiddenAt])
}

/// R1 · ідемпотентна доставка (A-05): snooze → новий dueAt → новий рядок
model ReminderDelivery {
  id         String              @id @default(dbgenerated("uuidv7()")) @db.Uuid
  reminderId String              @db.Uuid
  reminder   Reminder            @relation(fields: [reminderId], references: [id], onDelete: Cascade)
  dueAt      DateTime            @db.Timestamptz(3)   // копія Reminder.dueAt на момент планування
  channel    NotificationChannel
  status     DeliveryStatus      @default(PENDING)
  attempts   Int                 @default(0)
  sentAt     DateTime?           @db.Timestamptz(3)
  lastError  String?
  createdAt  DateTime            @default(now()) @db.Timestamptz(3)

  @@unique([reminderId, dueAt, channel])
  @@index([status, createdAt])
}

model Interview {
  id            String           @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId        String           @db.Uuid
  user          User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  applicationId String           @db.Uuid
  application   Application      @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  kind          InterviewKind
  startsAt      DateTime         @db.Timestamptz(3)
  durationMin   Int              @default(60)
  timezone      String                               // IANA, у якій користувач ввів час
  meetingUrl    String?
  interviewers  String?                              // PII третіх осіб
  prepNotes     String?
  debriefNotes  String?
  outcome       InterviewOutcome @default(PENDING)
  createdAt     DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime         @updatedAt @db.Timestamptz(3)
  reminders     Reminder[]

  @@index([userId, startsAt])                        // GET /interviews?from&to
  @@index([applicationId])
}

/// R1 · персональні дані третіх осіб (S-13)
model Contact {
  id           String               @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId       String               @db.Uuid
  user         User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  name         String
  role         ContactRole          @default(RECRUITER)
  email        String?
  linkedinUrl  String?
  telegram     String?
  companyName  String?
  notes        String?
  createdAt    DateTime             @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime             @updatedAt @db.Timestamptz(3)
  applications ApplicationContact[]

  @@index([userId, name])
}

/// R1 · додано (A-17 contact links)
model ApplicationContact {
  applicationId String      @db.Uuid
  application   Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  contactId     String      @db.Uuid
  contact       Contact     @relation(fields: [contactId], references: [id], onDelete: Cascade)
  createdAt     DateTime    @default(now()) @db.Timestamptz(3)

  @@id([applicationId, contactId])
  @@index([contactId])
}

model CareerProfile {
  userId                String           @id @db.Uuid
  user                  User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  headline              String?
  summary               String?
  yearsExperience       Decimal?         @db.Decimal(4, 1)
  seniority             Seniority?
  targetRoles           String[]
  country               String?          @db.Char(2)
  city                  String?
  linkedinUrl           String?
  githubUrl             String?
  portfolioUrl          String?
  workModes             WorkMode[]
  employmentTypes       EmploymentType[]
  preferredCountries    String[]                      // ISO 3166-1 alpha-2
  salaryMin             Int?
  salaryDesired         Int?
  salaryCurrency        String?          @db.Char(3)
  salaryPeriod          SalaryPeriod?
  salaryMinUsdMonth     Int?                          // A-22: обчислюється на запис (08)
  salaryDesiredUsdMonth Int?
  relocation            Boolean          @default(false)
  needsVisa             Boolean          @default(false)
  hardFilters           Json             @default("{}") // Zod: HardFilters
  excludedCompanyIds    String[]         @db.Uuid      // без FK (масив); неіснуючі id ігноруються при читанні
  updatedAt             DateTime         @updatedAt @db.Timestamptz(3)
}

model Experience {
  id           String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId       String    @db.Uuid
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  companyName  String
  position     String
  startDate    DateTime  @db.Date
  endDate      DateTime? @db.Date
  isCurrent    Boolean   @default(false)
  description  String?
  achievements String[]
  sortOrder    Int       @default(0)
  skills       Skill[]                      // implicit m2m "_ExperienceToSkill" (каскад з обох боків)
  createdAt    DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime  @updatedAt @db.Timestamptz(3)

  @@index([userId])
}

/// R1 · додано (FR-PROF: education)
model Education {
  id          String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId      String    @db.Uuid
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  institution String
  degree      String?
  field       String?
  startDate   DateTime? @db.Date
  endDate     DateTime? @db.Date

  @@index([userId])
}

/// R1 · мова користувача (CEFR)
model Language {
  userId       String    @db.Uuid
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  languageCode String    @db.Char(2)   // ISO 639-1
  level        CefrLevel

  @@id([userId, languageCode])
}

model Skill {
  id          String        @id @default(dbgenerated("uuidv7()")) @db.Uuid
  name        String        @unique   // "Node.js"
  slug        String        @unique   // "nodejs"
  category    SkillCategory
  createdAt   DateTime      @default(now()) @db.Timestamptz(3)
  aliases     SkillAlias[]
  userSkills  UserSkill[]
  jobSkills   JobSkill[]               // R2
  experiences Experience[]
}

model SkillAlias {
  alias   String @id                  // lower-case + f_unaccent: "node", "node.js"
  skillId String @db.Uuid
  skill   Skill  @relation(fields: [skillId], references: [id], onDelete: Cascade)

  @@index([skillId])
}

model UserSkill {
  userId       String          @db.Uuid
  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  skillId      String          @db.Uuid
  skill        Skill           @relation(fields: [skillId], references: [id], onDelete: Restrict)
  level        Int                                // 1..5 (CHECK)
  years        Decimal?        @db.Decimal(3, 1)
  lastUsedYear Int?
  preference   SkillPreference @default(NEUTRAL)

  @@id([userId, skillId])
  @@index([skillId])
}

/// R1 · логічний документ; файли — у DocumentVersion (immutable)
model Document {
  id        String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId    String            @db.Uuid
  user      User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind      DocumentKind
  title     String                                  // "CV — Full-stack (EN)"
  isDefault Boolean           @default(false)
  createdAt DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt DateTime          @updatedAt @db.Timestamptz(3)
  versions  DocumentVersion[]

  @@unique([userId, kind], where: { isDefault: true }, map: "document_default_per_kind_uq")
  @@index([userId, createdAt])
}

model DocumentVersion {
  id           String        @id @default(dbgenerated("uuidv7()")) @db.Uuid
  documentId   String        @db.Uuid
  document     Document      @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId       String        @db.Uuid                 // денормалізовано для findOwned
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  version      Int
  fileName     String
  mimeType     String
  sizeBytes    Int                                    // ≤ 5 MB (CHECK)
  storageKey   String        @unique                  // UUID, не ім'я файлу
  sha256       String
  status       DocumentStatus @default(PENDING)          // карантин (09 §6); download тільки READY
  parseStatus  ParseStatus   @default(PENDING)
  parsedText   String?                                // PII, redaction у логах (09)
  parseError   String?
  createdAt    DateTime      @default(now()) @db.Timestamptz(3)
  applications Application[]

  @@unique([documentId, version])
  @@index([userId, createdAt])
}

/// R1 · async повний експорт (zip, 24 год)
model DataExport {
  id           String       @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId       String       @db.Uuid
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  status       ExportStatus @default(PENDING)
  storageKey   String?      @unique
  sizeBytes    Int?
  error        String?
  expiresAt    DateTime?    @db.Timestamptz(3)   // completedAt + 24 год; потім файл видаляється
  completedAt  DateTime?    @db.Timestamptz(3)
  downloadedAt DateTime?    @db.Timestamptz(3)
  createdAt    DateTime     @default(now()) @db.Timestamptz(3)

  @@index([userId, createdAt])
  @@index([status, expiresAt])
}

model Notification {
  id        String           @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId    String           @db.Uuid
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  title     String
  body      String?
  link      String?                             // тільки відносний in-app шлях
  dedupeKey String                               // "REMINDER_DUE:<reminderId>:<dueAt>" тощо; ідемпотентність consumer-а
  readAt    DateTime?        @db.Timestamptz(3)
  createdAt DateTime         @default(now()) @db.Timestamptz(3)

  @@unique([userId, dedupeKey])
  @@index([userId, readAt, createdAt])
  @@index([createdAt])
}

/// R1 · додано: тип × канал
model NotificationPreference {
  userId  String              @db.Uuid
  user    User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  type    NotificationType
  channel NotificationChannel
  enabled Boolean             @default(true)
  mode    NotificationMode    @default(DIGEST)

  @@id([userId, type, channel])
}

model AiRun {
  id            String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId        String      @db.Uuid
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  task          AiTask
  promptVersion String
  provider      String                       // конфіг, не enum: провайдери змінюються без міграції
  model         String
  inputHash     String                       // sha256 контексту; сам input не зберігається
  status        AiRunStatus
  attempts      Int         @default(1)      // виклики provider-а в межах run (retry/repair, 07 §6)
  inputTokens   Int?
  outputTokens  Int?
  costMicroUsd  Int?
  latencyMs     Int?
  output        Json?                        // Zod: output схеми задачі; null після 30 днів (§8)
  error         String?
  createdAt     DateTime    @default(now()) @db.Timestamptz(3)

  @@index([userId, createdAt])
  @@index([userId, task, promptVersion, model, inputHash]) // кеш per-user + model (A-14)
}

/// R1 · бюджет користувача: атомарне резервування conditional UPDATE у PG (07-ai.md §4.1, A-13)
model AiUsageDaily {
  userId           String   @db.Uuid
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  usageDate        DateTime @db.Date        // локальна дата в UserSettings.timezone (не UTC)
  runs             Int      @default(0)
  reservedMicroUsd BigInt   @default(0)     // зарезервовано, ще не settled
  usedMicroUsd     BigInt   @default(0)     // фактична вартість
  inputTokens      Int      @default(0)
  outputTokens     Int      @default(0)

  @@id([userId, usageDate])
  @@index([usageDate])
}

/// R1 · глобальні денні caps (UTC-дата): ALL — усі користувачі, DEMO — усі demo разом (07-ai.md §4.2)
model AiGlobalUsageDaily {
  usageDate        DateTime     @db.Date
  scope            AiUsageScope
  reservedMicroUsd BigInt       @default(0)
  usedMicroUsd     BigInt       @default(0)

  @@id([usageDate, scope])
}

/// R1 · tombstone видаленого акаунта: після restore бекапу цих користувачів видаляють повторно (09 §12.1, 12 §5)
model DeletedUserTombstone {
  id        String   @id @db.Uuid               // = колишній User.id; без FK
  deletedAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([deletedAt])                         // retention 30 днів (§8)
}

/// R1 · transactional outbox (A-04). Relay і consumers — 04-architecture.md
model OutboxEvent {
  id            String          @id @default(dbgenerated("uuidv7()")) @db.Uuid
  type          DomainEventType
  aggregateType String                        // назва моделі ("Application"); відкрита множина
  aggregateId   String          @db.Uuid
  userId        String?         @db.Uuid      // без FK: USER_DELETION_REQUESTED має пережити видалення User
  payload       Json                          // Zod: DomainEventPayload[type]; тільки id, без PII
  createdAt     DateTime        @default(now()) @db.Timestamptz(3)
  nextAttemptAt DateTime        @default(now()) @db.Timestamptz(3)
  lockedUntil   DateTime?       @db.Timestamptz(3)
  lockedBy      String?                       // worker instance id
  attempts      Int             @default(0)
  maxAttempts   Int             @default(10)
  lastError     String?
  publishedAt   DateTime?       @db.Timestamptz(3)

  @@index([nextAttemptAt], where: raw("\"publishedAt\" IS NULL"), map: "outbox_pending_idx")
  @@index([publishedAt], where: raw("\"publishedAt\" IS NOT NULL"), map: "outbox_published_idx") // cleanup 7 днів
}

/// R1 · append-only (S-14), 90 днів
model AuditLog {
  id           String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId       String?     @db.Uuid
  user         User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  action       AuditAction
  resourceType String?                        // назва моделі; відкрита множина
  resourceId   String?     @db.Uuid
  ip           String?     @db.Inet           // анонімізується при hard delete (§8)
  userAgent    String?
  metadata     Json?                          // Zod: AuditMetadata[action]; без PII
  createdAt    DateTime    @default(now()) @db.Timestamptz(3)

  @@index([userId, createdAt])
  @@index([createdAt])
}

```

### 4.4. R2: ingestion, matching, saved searches, FX

```prisma
/// R2 · курси НБУ (ADR 019, 08 §7.2); модуль jobs
model ExchangeRate {
  base   String   @db.Char(3)
  quote  String   @db.Char(3)
  date   DateTime @db.Date
  rate   Decimal  @db.Decimal(18, 8)
  source String                               // "NBU"; String, бо джерело може змінитись без міграції

  @@id([base, quote, date])
}

model JobSource {
  id                  String        @id @default(dbgenerated("uuidv7()")) @db.Uuid
  key                 String        @unique  // greenhouse, lever, ashby, dou_rss, manual, url_capture
  name                String
  kind                JobSourceKind
  enabled             Boolean       @default(false)
  config              Json                    // Zod: SourceConfig[key]
  tosReviewedAt       DateTime?     @db.Timestamptz(3)
  tosNotes            String?
  lastSuccessAt       DateTime?     @db.Timestamptz(3)
  lastErrorAt         DateTime?     @db.Timestamptz(3)
  lastError           String?
  consecutiveFailures Int           @default(0)
  createdAt           DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt           DateTime      @updatedAt @db.Timestamptz(3)
  sourceJobs          SourceJob[]
}

model SourceJob {
  id             String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  sourceId       String      @db.Uuid
  source         JobSource   @relation(fields: [sourceId], references: [id], onDelete: Restrict)
  externalId     String                      // A-11: NOT NULL; fallback = sha256(canonicalUrl)
  canonicalUrl   String
  rawPayload     Json                        // Zod: SourcePayload[key]
  contentHash    String                      // sha256 нормалізованого payload
  publishedAt    DateTime?   @db.Timestamptz(3)
  firstSeenAt    DateTime    @db.Timestamptz(3)
  lastSeenAt     DateTime    @db.Timestamptz(3)
  missedRuns     Int         @default(0)     // A-11: відсутня в N поспіль прогонах → goneAt
  goneAt         DateTime?   @db.Timestamptz(3)
  jobId          String?     @db.Uuid
  job            Job?        @relation(fields: [jobId], references: [id], onDelete: SetNull)
  linkMethod     LinkMethod?
  linkConfidence Float?                      // 0..1 (CHECK)

  @@unique([sourceId, externalId])
  @@index([canonicalUrl])
  @@index([jobId])
  @@index([sourceId, lastSeenAt])
}

model JobSkill {
  jobId      String          @db.Uuid
  job        Job             @relation(fields: [jobId], references: [id], onDelete: Cascade)
  skillId    String          @db.Uuid
  skill      Skill           @relation(fields: [skillId], references: [id], onDelete: Restrict)
  importance SkillImportance
  source     JobSkillSource

  @@id([jobId, skillId])
  @@index([skillId])
}

model SavedSearch {
  id         String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId     String            @db.Uuid
  user       User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  name       String
  query      Json                                  // Zod: JobQuery (той самий, що GET /jobs)
  notify     SavedSearchNotify @default(NONE)
  isActive   Boolean           @default(true)
  lastRunAt  DateTime?         @db.Timestamptz(3)
  lastSeenAt DateTime?         @db.Timestamptz(3)  // лічильник "new"
  createdAt  DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime          @updatedAt @db.Timestamptz(3)

  @@index([userId])
  @@index([isActive, notify])
}

/// R2 · колишній MatchResult
model MatchScore {
  userId           String           @db.Uuid
  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId            String           @db.Uuid
  job              Job              @relation(fields: [jobId], references: [id], onDelete: Cascade)
  algorithmVersion String                              // "v1.0.0"
  inputsHash       String
  score            Int?                                // 0..100; null = excluded / мало даних
  confidence       Float                               // 0..1
  excluded         Boolean          @default(false)
  excludedReasons  MatchExclusion[] @default([])
  breakdown        Json                                // Zod: MatchBreakdown
  computedAt       DateTime         @db.Timestamptz(3)

  @@id([userId, jobId])
  @@index([userId, excluded, score(sort: Desc)])
}

model MatchFeedback {
  id               String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId           String            @db.Uuid
  user             User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId            String            @db.Uuid
  job              Job               @relation(fields: [jobId], references: [id], onDelete: Cascade)
  kind             MatchFeedbackKind
  comment          String?
  algorithmVersion String
  createdAt        DateTime          @default(now()) @db.Timestamptz(3)

  @@index([userId, createdAt])
  @@index([jobId])
}
```

### 4.5. R3: embeddings

```prisma
/// R3 · додано. pgvector у Prisma 7 — тільки Unsupported + $queryRaw
model JobEmbedding {
  jobId     String                    @db.Uuid
  job       Job                       @relation(fields: [jobId], references: [id], onDelete: Cascade)
  model     String
  embedding Unsupported("vector(1536)") // розмірність = модель (ADR при R3)
  createdAt DateTime                  @default(now()) @db.Timestamptz(3)

  @@id([jobId, model])
}
```

### 4.6. Доступ до `Unsupported`-полів

Prisma Client не повертає й не фільтрує `searchVector` і `embedding`. Запити до них живуть у `jobs.search.repository.ts` / `matching.semantic.repository.ts` як типізовані хелпери над `$queryRaw` (tagged template, без `$queryRawUnsafe`). Результат валідовано Zod.

### 4.7. Рішення, прийняті в цьому файлі

| Рішення | Причина |
|---|---|
| `User.demoExpiresAt` замість окремої таблиці demo | Рішення 7. Demo-користувач ⇔ `demoExpiresAt IS NOT NULL`; `role` лишається `USER` (`Role` = `USER`/`ADMIN`, без `DEMO`). Purge-job видаляє `User` → каскад. |
| Статус карантину — `DocumentVersion.status`, а не `Document` | Кожен upload — нова версія; `Document` з READY-версією може мати нову PENDING-версію. `DocumentStatus` = `PENDING`/`READY`/`REJECTED`. |
| AI-гроші — `BigInt` micro-USD | Глобальні суми за день можуть перевищити `Int`. |
| `ReminderStatus` без `SNOOZED`/`DELIVERED` | Snooze змінює `dueAt` і збільшує `snoozeCount`. Доставка ведеться per channel у `ReminderDelivery`. |
| `ApplicationEvent` без `idempotencyKey` | Ідемпотентність забезпечує `IdempotencyRecord`, записаний у тій самій транзакції (A-07). |
| `aiEnabled` за замовчуванням `false` | AI вмикається явно (opt-in), узгоджено з `09-security-privacy.md`. |
| `DELETE /applications/:id` — hard delete | Оборотний варіант — archive. Undo через toast стосується лише transitions і archive (`06-api.md`). |
| `Document` → `Document` + `DocumentVersion` | Immutable версії. `Application` посилається на конкретну версію (A-20, трактовка — див. питання у звіті). |

## 5. FK і каскади (A-01)

| FK | onDelete | Пояснення |
|---|---|---|
| `Session/Account.userId` → User | Cascade | auth-дані |
| `UserSettings/CareerProfile.userId` → User | Cascade | 1:1 |
| `Job.ownerId` → User | Cascade | приватні вакансії власника |
| `Job.companyId` → Company | SetNull | R1 · Company — глобальний довідник |
| `Application.userId` → User | Cascade | |
| `Application.jobId` → Job | **SetNull** | snapshot `companyName`/`roleTitle` лишається |
| `Application.cvDocumentVersionId` → DocumentVersion | **SetNull** | R1 · видалення CV не видаляє заявку |
| `ApplicationEvent.applicationId` → Application, `.userId` → User | Cascade | |
| `Reminder.userId/applicationId/interviewId` | Cascade | `interviewId` — R1 |
| `ReminderDelivery.reminderId` → Reminder | Cascade | |
| `Interview.userId/applicationId` | Cascade | |
| `Contact.userId` → User | Cascade | |
| `ApplicationContact.applicationId/contactId` | Cascade | видаляється лише зв'язок |
| `Experience/Education/Language/UserSkill.userId` → User | Cascade | |
| `_ExperienceToSkill` (implicit) | Cascade | керує Prisma |
| `UserSkill.skillId`, `JobSkill.skillId` → Skill | Restrict | словник не видаляється, поки є посилання |
| `SkillAlias.skillId` → Skill | Cascade | |
| `Document.userId`, `DocumentVersion.documentId/userId` | Cascade | об'єкти storage видаляє job (за `DOCUMENT_DELETED`) |
| `UserJob.userId/jobId` | Cascade | |
| `ImportSession/IdempotencyRecord/DataExport/Notification/NotificationPreference.userId` | Cascade | `DataExport`, `Notification*` — R1 |
| `AiRun/AiUsageDaily.userId` → User | Cascade | |
| `DeletedUserTombstone`, `AiGlobalUsageDaily` | — (без FK) | tombstone має пережити `User`; глобальні рядки без власника |
| `SavedSearch/MatchScore/MatchFeedback.userId` → User | Cascade | |
| `MatchScore/MatchFeedback/JobSkill/JobEmbedding.jobId` → Job | Cascade | |
| `SourceJob.sourceId` → JobSource | Restrict | джерело вимикають (`enabled=false`), а не видаляють |
| `SourceJob.jobId` → Job | SetNull | публікація лишається для повторного лінкування |
| `AuditLog.userId` → User | **SetNull** | журнал переживає видалення; `ip` анонімізується (§8) |
| `OutboxEvent.userId` | — (без FK) | подія видалення має пережити `User` |

R0-міграція створює лише FK моделей R0 (§3) без колонок з маркером релізу; решта рядків — з міграцією відповідної моделі.

PostgreSQL виконує referential actions з правами власника таблиці, тому `SetNull` на `AuditLog` працює навіть тоді, коли в app-ролі відібрано `UPDATE` (§7.5).

## 6. Семантика ключових обмежень

### 6.1. Одна активна заявка на вакансію (P-22)

- Індекс `application_user_job_active_uq`: `UNIQUE (userId, jobId) WHERE jobId IS NOT NULL AND archivedAt IS NULL`.
- «Активна» означає `archivedAt IS NULL` **незалежно від статусу**. `REJECTED`/`GHOSTED` теж активні, доки їх не заархівовано.
- Повторна подача на ту саму вакансію (наприклад, після `REJECTED`): створення нової заявки при наявній активній → `409 CONFLICT_ACTIVE_APPLICATION` з `details.existingApplicationId`; UI пропонує **заархівувати стару** (`POST /applications/:id/archive`) і повторює створення (`06-api.md` §3.1, `03-functional.md` FR-APP-02). Альтернатива — reopen старої заявки.
- Unarchive заявки, для якої вже є інша активна → той самий 409.
- Заявки без `jobId` не обмежуються.

### 6.2. Next action ↔ Reminder (P-05)

- Джерело правди — `Reminder(source = NEXT_ACTION, status = PENDING)`. На одну заявку може бути не більше одного такого reminder (`reminder_next_action_active_uq`).
- `Application.nextActionText/nextActionAt` — кеш, який оновлюється в **тій самій транзакції**, що й reminder. У R0 це синхронний виклик `reminders` service, без outbox (рішення 2). Done або cancel reminder очищає кеш.

### 6.3. Активність і stale (P-04)

- `lastActivityAt` оновлюється на будь-яку подію з `actor = USER` (transition, note, message, follow-up, редагування полів заявки) і на CSV-подію, якщо вона новіша. Значення = `max(lastActivityAt, occurredAt)`.
- Stale **рахується при читанні**: `status ∈ {APPLIED, SCREENING}` і `lastActivityAt < now − staleFollowUpDays`; `status ∈ {INTERVIEW, TEST_TASK}` і поріг `staleDaysAfterInterview`. Додатково виконується умова `staleDismissedUntil IS NULL OR < now`. Окремої колонки «stale» немає.
- `GHOSTED` ставить тільки користувач; після `staleGhostDays` система лише показує підказку.

### 6.4. Приватний дедуп capture (A-08/P-12)

`job_owner_canonical_url_private_uq`: `UNIQUE (ownerId, canonicalUrl) WHERE visibility = 'PRIVATE'`. `NULL`-URL не конфліктують. Перевірка проти PUBLIC — пошук за `@@index([canonicalUrl])`. Логіка — `08-ingestion-matching.md`.

### 6.5. Outbox claim (A-04)

Relay виконує три кроки: claim (коротка транзакція) → commit → publish у BullMQ (`jobId = <eventId>_<consumer>`; BullMQ забороняє `:` у custom jobId) → `UPDATE publishedAt`. Під час publish транзакція не тримається.

```sql
UPDATE "OutboxEvent" SET "lockedUntil" = now() + interval '30 seconds', "lockedBy" = $1,
       "attempts" = "attempts" + 1
WHERE id IN (
  SELECT id FROM "OutboxEvent"
  WHERE "publishedAt" IS NULL AND "nextAttemptAt" <= now()
    AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
    AND "attempts" < "maxAttempts"
  ORDER BY "nextAttemptAt" LIMIT 50
  FOR UPDATE SKIP LOCKED)
RETURNING *;
```

- Помилка publish: `nextAttemptAt = now() + backoff(attempts)`, `lastError` заповнюється.
- `attempts = maxAttempts` → подія стає dead (лишається неопублікованою) і спрацьовує алерт (`12-infra-ops.md`).
- Cleanup: `DELETE WHERE publishedAt < now() − 7 days`.

### 6.6. Idempotency (A-07, S-18)

`IdempotencyRecord` вставляється в тій самій транзакції, що й мутація. Конфлікт `(userId, key)` означає replay збереженої відповіді або `422`, якщо `requestHash` не збігається. Повна семантика — `06-api.md` §4.

## 7. Raw SQL у міграціях

Raw SQL додається тільки через `prisma migrate dev --create-only` і ручне редагування згенерованої міграції. Кожен фрагмент у міграції коментується з посиланням на цей розділ.

### 7.1. Extensions (R0 — `pg_trgm`, `unaccent`; R3 — `vector`)

```sql
-- pg_trgm: fuzzy-пошук за назвою вакансії/компанії (gin_trgm_ops у schema.prisma)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- unaccent: нормалізація діакритики для normalizedTitle/normalizedName/search_vector
CREATE EXTENSION IF NOT EXISTS unaccent;
-- R3: pgvector для JobEmbedding
-- CREATE EXTENSION IF NOT EXISTS vector;
-- uuidv7() — вбудована в PostgreSQL 18, extension не потрібен
```

### 7.2. `f_unaccent`

```sql
-- unaccent() має STABLE (залежить від search_path/словника) → не можна в generated column/index.
-- Обгортка з явним словником може бути IMMUTABLE.
CREATE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
```

### 7.3. FTS generated column (R1)

Prisma згенерує `ALTER TABLE "Job" ADD COLUMN "search_vector" tsvector;`. Цей рядок **замінюється** на:

```sql
-- 'simple': вбудованого українського словника немає; вакансії змішують EN/UA/RU, fuzzy дає pg_trgm.
-- STORED обов'язково: у PG18 generated columns за замовчуванням VIRTUAL, а virtual не індексуються.
ALTER TABLE "Job" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', f_unaccent(coalesce("title", ''))), 'A') ||
  setweight(to_tsvector('simple', f_unaccent(coalesce("companyNameRaw", ''))), 'B') ||
  setweight(to_tsvector('simple', f_unaccent(coalesce("descriptionText", ''))), 'C')
) STORED;
-- GIN-індекс job_search_gin оголошено в schema.prisma (@@index type: Gin) — тут не дублюється.
```

Поле в схемі **має** `@default(dbgenerated())` (без аргументу): Migrate читає generation expression як column default, і без цього атрибута `migrate diff` бачить drift (`ALTER COLUMN "search_vector" DROP DEFAULT`). З ним — `No difference detected`, а `--create-only` генерує звичайний `tsvector`, який замінюється на рядок вище (перевірено M0-03, Prisma 7.10.1 / PG 18).

### 7.4. CHECK constraints (Prisma їх не моделює і не вважає drift)

Кожен CHECK додається міграцією, що створює його колонки (тег релізу в коментарі).

```sql
-- R0 · Job: власник є тоді й лише тоді, коли вакансія приватна
ALTER TABLE "Job" ADD CONSTRAINT job_visibility_owner_chk
  CHECK ((visibility = 'PRIVATE') = ("ownerId" IS NOT NULL));
-- R0 · Job: діапазон зарплати
ALTER TABLE "Job" ADD CONSTRAINT job_salary_chk
  CHECK ("salaryMin" IS NULL OR "salaryMax" IS NULL OR "salaryMin" <= "salaryMax");
-- R0 · Application: суми без валюти не мають сенсу
ALTER TABLE "Application" ADD CONSTRAINT application_salary_currency_chk
  CHECK (("salaryExpected" IS NULL AND "salaryOffered" IS NULL) OR "salaryCurrency" IS NOT NULL);
-- R0 · UserSettings: розумні межі
ALTER TABLE "UserSettings" ADD CONSTRAINT user_settings_ranges_chk
  CHECK ("staleFollowUpDays" BETWEEN 1 AND 90 AND "staleDaysAfterInterview" BETWEEN 1 AND 90
         AND "staleGhostDays" BETWEEN 1 AND 180);
-- R1 · UserSettings: quiet hours парою
ALTER TABLE "UserSettings" ADD CONSTRAINT user_settings_quiet_hours_chk
  CHECK (("quietHoursStart" IS NULL) = ("quietHoursEnd" IS NULL)
         AND coalesce("quietHoursStart", 0) BETWEEN 0 AND 1439
         AND coalesce("quietHoursEnd", 0) BETWEEN 0 AND 1439);
-- R0 · Reminder: прив'язка NEXT_ACTION обов'язково до заявки
ALTER TABLE "Reminder" ADD CONSTRAINT reminder_source_link_chk
  CHECK ("source" <> 'NEXT_ACTION' OR "applicationId" IS NOT NULL);
-- R1 · INTERVIEW_AUTO — до інтерв'ю (окремий CHECK разом із колонкою interviewId)
ALTER TABLE "Reminder" ADD CONSTRAINT reminder_interview_link_chk
  CHECK ("source" <> 'INTERVIEW_AUTO' OR "interviewId" IS NOT NULL);
-- R1 · Interview: тривалість
ALTER TABLE "Interview" ADD CONSTRAINT interview_duration_chk CHECK ("durationMin" BETWEEN 5 AND 600);
-- R1 · Experience: дати
ALTER TABLE "Experience" ADD CONSTRAINT experience_dates_chk
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate") ;
ALTER TABLE "Experience" ADD CONSTRAINT experience_current_chk
  CHECK (NOT "isCurrent" OR "endDate" IS NULL);
-- R1 · UserSkill: рівень 1..5
ALTER TABLE "UserSkill" ADD CONSTRAINT user_skill_level_chk CHECK ("level" BETWEEN 1 AND 5);
-- R1 · DocumentVersion: ліміт 5 MB (дублює перевірку upload)
ALTER TABLE "DocumentVersion" ADD CONSTRAINT document_version_size_chk
  CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880);
-- R2 · MatchScore / SourceJob: діапазони
ALTER TABLE "MatchScore" ADD CONSTRAINT match_score_range_chk
  CHECK (("score" IS NULL OR "score" BETWEEN 0 AND 100) AND "confidence" BETWEEN 0 AND 1);
ALTER TABLE "SourceJob" ADD CONSTRAINT source_job_link_confidence_chk
  CHECK ("linkConfidence" IS NULL OR "linkConfidence" BETWEEN 0 AND 1);
-- R1 · OutboxEvent: attempts не перевищує maxAttempts
ALTER TABLE "OutboxEvent" ADD CONSTRAINT outbox_attempts_chk CHECK ("attempts" <= "maxAttempts");
```

### 7.5. AuditLog append-only (R1)

```sql
-- app-роль може тільки вставляти й читати; retention/анонімізацію виконує роль applyra_maintenance
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM applyra_app;
GRANT  UPDATE ("ip", "userAgent"), DELETE ON "AuditLog" TO applyra_maintenance;
```

Ролі `applyra_app` (runtime) і `applyra_maintenance` (міграції, retention) та їхні connection strings — `12-infra-ops.md` §4, §6–7.

### 7.6. Vector index (R3)

```sql
-- HNSW Prisma не виражає; ризик drift перевіряється при R3 (див. відкриті питання)
CREATE INDEX job_embedding_hnsw ON "JobEmbedding" USING hnsw ("embedding" vector_cosine_ops);
```

## 8. Retention (колонки та механізм)

Строки й юридичні підстави визначає `09-security-privacy.md`. Тут описано, **на чому** тримається кожна політика. Усі cleanup-задачі — BullMQ job schedulers (з R1; у R0 — тільки `pg_dump`).

| Таблиця | PII | Колонка / механізм |
|---|---|---|
| `User` | email, name, image | `deletedAt` → hard-delete job ≤ 24 год → каскад §5. Demo: `demoExpiresAt` < now → purge |
| `Session` | ipAddress, userAgent | `expiresAt` < now → щоденне видалення |
| `Account` | OAuth-токени | разом з User; токени — `09` |
| `Verification` | identifier (email) | `expiresAt` < now → видалення |
| `Application`, `ApplicationEvent` | notes, payload | доки користувач не видалить; експорт/видалення — FR-PRIV |
| `Contact`, `Interview.interviewers` | PII третіх осіб | видаляються з користувачем; окремо видаляються через `DELETE /contacts/:id` |
| `DocumentVersion` | файл, `parsedText` | hard delete рядка + об'єкта storage (подія `DOCUMENT_DELETED`); `REJECTED` → видалення через 24 год |
| `ImportSession` | `rows` | `rows = NULL` на commit або при `expiresAt`; рядок видаляється через 7 днів |
| `DataExport` | zip-файл | застосунок видаляє об'єкт при `expiresAt` (24 год), статус `EXPIRED`; bucket lifecycle 48 год — лише страховка; рядок — 30 днів |
| `IdempotencyRecord` | `responseJson` | `expiresAt` (24 год) → видалення |
| `Notification` | title/body | `createdAt` > 90 днів → видалення |
| `ReminderDelivery` | — | `createdAt` > 90 днів → видалення |
| `AiRun` | `output` | `output = NULL` через 30 днів, рядок — 90 днів |
| `AiUsageDaily`, `AiGlobalUsageDaily` | — | `usageDate` старше 90 днів → видалення |
| `DeletedUserTombstone` | — (тільки UUID) | `deletedAt` старше 30 днів → видалення (maintenance-роль) |
| `AuditLog` | ip, userAgent | `createdAt` > 90 днів → видалення (maintenance-роль); при hard delete користувача `ip/userAgent = NULL`, `userId` → SetNull |
| `OutboxEvent` | — (payload тільки з id) | `publishedAt` > 7 днів → видалення |
| `SourceJob` | — (публічні дані) | `rawPayload` очищується через 90 днів після `goneAt` |

Бекапи, Sentry, логи й Redis не є таблицями. Їх покриває таблиця сховищ у `09-security-privacy.md`.

## 9. Drift і міграції в CI

- Shadow DB для `migrate diff` бере `datasource.shadowDatabaseUrl` з `prisma.config.ts` (Testcontainers Postgres 18 у CI).
- Exit code `2` означає, що схема і міграції розійшлися, і CI падає.
- Лінтер міграцій (squawk), `lock_timeout` і expand/contract описані в `12-infra-ops.md`. Migration tests — у `11-testing.md`.

```bash
prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
```

## Зміни відносно v2.0

- **A-01** — явний `onDelete` на кожному FK, таблиця каскадів §5.
- **A-02** — UUID v7: PG18 `uuidv7()` + Better Auth `generateId`; auth-таблиці з `@db.Uuid`.
- **A-04** — `OutboxEvent` з `lockedUntil/attempts/maxAttempts/nextAttemptAt/lastError`, partial index, cleanup 7 днів; з R1.
- **A-05** — `Reminder.source`, `ReminderDelivery(reminderId, dueAt, channel)` unique замість `deliveryKey`.
- **A-06** — `UserSettings`, `DataExport`, `ImportSession`, `IdempotencyRecord`, `AiUsageDaily`, `User.role`, `User.deletedAt`.
- **A-13** — `AiUsageDaily` за локальною датою з `reservedMicroUsd`/`usedMicroUsd`; `AiGlobalUsageDaily` (scope `ALL`/`DEMO`).
- **A-07** — idempotency per `(userId, key)` зі збереженою відповіддю; `ApplicationEvent.idempotencyKey` прибрано.
- **A-08/P-12** — `Job.canonicalUrl` + partial unique для PRIVATE.
- **A-09** — `@@index([ownerId, createdAt])`, хелпер `findAccessibleJob`.
- **A-10** — `Unsupported("tsvector")`, GIN/trigram/partial-індекси в схемі (`partialIndexes`), `migrate diff --exit-code`.
- **A-11** — `SourceJob.externalId` NOT NULL, `missedRuns`.
- **A-12** — усі фіксовані множини стали Prisma enums.
- **A-14** — ключ кешу `AiRun` включає `userId` і `model`.
- **A-20** — `Document` + `DocumentVersion` (трактовка; див. звіт).
- **A-21** — `UserJob.savedAt/hiddenAt/viewedAt` замість `UserJobState`.
- **A-22** — `Application.salaryPeriod`; `CareerProfile.salaryMinUsdMonth/salaryDesiredUsdMonth`.
- **A-23** — `Company` лишається таблицею в модулі jobs.
- **P-03** — timezone і quiet hours перенесено з `CareerProfile` у `UserSettings`.
- **P-04** — `lastActivityAt` визначено, `staleDismissedUntil`, stale рахується при читанні.
- **P-05** — Reminder як джерело next action, `nextAction*` як кеш.
- **P-06** — `ImportSession` + `Application.importKey`.
- **P-21** — фіксовані множини (`InterviewKind` та ін.) — enums.
- **P-22** — активна = `archivedAt IS NULL`; повторна подача — через архівування старої (§6.1).
- **S-05** — `session.freshAge` = 10 хв.
- **S-08 / S-12** — `DocumentVersion.status` для карантину; `DeletedUserTombstone`; `Notification.dedupeKey`.
- **S-14** — `AuditAction` enum, append-only grants.
- **Рішення 5, 7** — PostgreSQL 18; `User.demoExpiresAt`.
- Перейменування: `WorkExperience` → `Experience`, `UserLanguage` → `Language`, `MatchResult` → `MatchScore`. Додано `ApplicationContact`, `Education`, `NotificationPreference`, `JobEmbedding`.
