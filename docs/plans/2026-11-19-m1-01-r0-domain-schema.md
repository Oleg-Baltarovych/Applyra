# M1-01 · R0 domain schema migration

FR-APP-02, FR-JOB-04 (+ schema support for FR-APP-01/03/04/09/11, FR-REM-01/02, FR-IMP) · spec `05-data-model.md` §1, §3, §4.1–4.2, §5, §6, §7.4, §8 · `06-api.md` §4–§5 · ADR 006, 012, 016, 025 · branch `feat/M1-01-r0-domain-schema` · depends M0-08 (done). Est 2h → realistic ~3h (constraint test suite).

## Scope
- New R0 enums + models `Job`, `Application`, `ApplicationEvent`, `Reminder`, `ImportSession`, `IdempotencyRecord` and User back-relations — only unmarked items of 05 §4.1–4.2 (no `// R1+`/`// R2`/`// R3` fields, indexes or relations: no `UserJob`, `Company`, `searchVector`, `job_title_trgm`, `cvDocumentVersionId`, `AiProfilePart`). ADR 025: nothing from R1-lite (CareerProfile/JobSkill come with M4-01).
- One migration `r0_domain` (Prisma-generated DDL + raw SQL: timeouts, CHECKs). User-scope guard registration. Factories + constraint integration tests.
- Out of scope: repositories/services/endpoints (M1-03…M1-12), contracts (M1-02), retention cleanup jobs (R1, BullMQ), FTS/trigram (R1).

## Acceptance criteria → test
1. `schema.prisma` has every R0 enum of 05 §4.1 with **all** values (incl. `JobVisibility.PUBLIC`, `ReminderSource.INTERVIEW_AUTO`, `INTERVIEW_*` event types — no `ALTER TYPE` later) and the six models with FK/onDelete of §5 → drift: `prisma migrate diff --from-migrations … --to-schema … --exit-code` = 0 (CI `migrations` + local); squawk clean on the new `migration.sql`.
2. Partial uniques → `test/integration/r0-schema.test.ts` (SQLSTATE `23505` + constraint name asserted):
   - `application_user_job_active_uq`: 2nd active app on (user, job) fails; archived + new active OK; two `jobId = NULL` OK; same job for user B OK.
   - `job_owner_canonical_url_private_uq`: same `canonicalUrl` for the same owner fails; other owner OK; two NULL URLs OK.
   - `reminder_next_action_active_uq`: 2nd PENDING `NEXT_ACTION` on an app fails; DONE/CANCELLED + new PENDING OK; MANUAL rows not limited.
   - `application_user_import_key_uq`, `IdempotencyRecord (userId, key)`: duplicate fails, other user OK.
3. Every CHECK below → one violating insert/update per constraint, `23514` + name asserted; one valid row per table passes.
4. Cascades (same test file): deleting a User removes its Jobs, Applications, Events, Reminders, ImportSessions, IdempotencyRecords (counts 0, other user untouched); deleting a Job sets `Application.jobId = NULL` and keeps `companyName`/`roleTitle`; deleting an Application removes its events + reminders.
5. Event tenancy: an `ApplicationEvent` with `userId` ≠ its application's `userId` → `23503` (composite FK, Decision 5).
6. Ids default to v7 (`uuid_extract_version(id) = 7` on a raw insert without id); all timestamps are `timestamptz(3)` (`information_schema.columns` query over the six tables).
7. `applyra_app` can SELECT/INSERT/UPDATE/DELETE on all six tables (default privileges via `pnpm db:migrate` as maintenance) and has no TRUNCATE → `has_table_privilege` assertions.
8. `test/user-scope-coverage.test.ts` green with the new models; extension throws `UnscopedQueryError` for `job.findFirst({ where: { id } })` and `application.findMany({})`, passes with `ownerId`/`userId` (extend `test/integration/user-scope*.test.ts`).

## Decisions
1. **Enums, not lookup tables** (D-4): fixed sets mirrored in contracts (M1-02). Full R0 value sets now.
2. **Status machine** = `ApplicationStatus` column + rules in `applications.domain.ts` (M1-05); no transition table/trigger. DB only guarantees event shape: `application_event_status_chk` = `type <> 'STATUS_CHANGED' OR ("fromStatus" IS NOT NULL AND "toStatus" IS NOT NULL AND "fromStatus" <> "toStatus")` (undo in M1-08 relies on `fromStatus`).
3. **Soft archive** = `archivedAt timestamptz NULL` (status untouched, P-22); `ARCHIVED`/`UNARCHIVED` events. Hard delete only via `DELETE /applications/:id`.
4. **Timeline** = `ApplicationEvent`, append-mostly, NOT revoked: undo (M1-08) deletes, cascades delete. No REVOKE pattern in R0 (AuditLog is R1, 05 §7.5).
5. **Composite FK for events** (defence in depth vs cross-tenant rows): `Application @@unique([id, userId])` + `ApplicationEvent.application @relation(fields: [applicationId, userId], references: [id, userId], onDelete: Cascade)`; `user` relation on `userId` stays (Cascade). Bonus: `findUnique({ where: { id_userId } })` is owner-scoped for the guard. Not for `Reminder` (optional `applicationId` + required `userId` → Prisma requires the relation to be required; R1 MANUAL reminders have no app) — service checks via `findOwned`. If Prisma rejects the overlapping `userId` scalar or diff drifts: fall back to the spec's plain FK and note it in the PR.
6. **Next action**: `Reminder(source NEXT_ACTION, PENDING)` is the truth (P-05), partial unique as spec; `reminder_source_link_chk`; cache pair `application_next_action_pair_chk` = `("nextActionText" IS NULL) = ("nextActionAt" IS NULL)`; `reminder_snooze_count_chk` (`>= 0`).
7. **Idempotency** (M1-03 needs claim-first): `statusCode Int?` + `responseJson Json?`, CHECK `idempotency_response_pair_chk` (both NULL or both set) + `statusCode BETWEEN 200 AND 499` (5xx never stored, 06 §4). M1-03 inserts the row first in the mutation tx (takes the unique lock early, so a parallel request waits and replays instead of hitting a domain 409), fills it before commit. A NULL row is never visible after commit. `key` = `String` (TEXT) + CHECK `"key" ~ '^[A-Za-z0-9_-]{8,128}$'` instead of `VarChar(128)` (squawk `prefer-text-field`; also enforces the 06 §4 format).
8. **canonicalUrl** uniqueness per owner = spec partial unique (PRIVATE only, NULLs free). R2 `@@index([canonicalUrl])` not created.
9. **Search in R0**: no FTS/trigram index — `q` (M1-10) is ILIKE on `companyName`/`roleTitle` within one user's rows (hundreds); covered by `userId` indexes. trgm/GIN come with R1.
10. **CHECKs** (end of migration, comment `05 §7.4 · R0`): spec `job_visibility_owner_chk`, `job_salary_chk`, `application_salary_currency_chk`, `reminder_source_link_chk`; added: `job_salary_nonneg_chk`, `application_salary_nonneg_chk` (`>= 0`), `job_currency_chk`/`application_currency_chk` (`~ '^[A-Z]{3}$'`), `job_country_chk` (`~ '^[A-Z]{2}$'`), `import_session_row_count_chk` (`0..5000`, 06 §5), plus 2, 6, 7. Text-length limits stay in Zod (M1-02), not DB.
11. **CHAR(2)/CHAR(3)** kept per D-6; if squawk `ban-char-field` fires, exclude it in `.squawk.toml` with reason (fixed ISO codes, regex CHECK) — no type change.
12. **Cascades** exactly 05 §5 (all user-owned → Cascade on User; `Application.jobId` SetNull; Reminder/Event → Cascade on Application). Every FK explicit `onDelete`.
13. **UUID v7** = DB default `uuidv7()`; repositories omit `id` (no app-side generator). Keyset cursors (M1-09/10) tie-break on `id` (time-ordered).
14. **Timestamps** `@db.Timestamptz(3)` everywhere; `occurredAt`, `dueAt`, `expiresAt` have no default (service sets them).
15. **User-scope guard**: add `Application`, `ApplicationEvent`, `Reminder`, `ImportSession`, `IdempotencyRecord` → `userId`; `Job` → `ownerId` (R0 has only PRIVATE rows, so `findAccessibleJob` = `{ id, ownerId }` in R0; when R2 adds PUBLIC jobs, move Job to `UNGUARDED_OWNED_MODELS` with reason).
16. `Job.normalizedTitle` stays NOT NULL computed on write (spec); M1-04 computes it in `jobs.domain.ts` (lower + NFKD strip marks) — flagged there, not here.

## Files
- `apps/api/prisma/schema.prisma` (enums + 6 models + User back-relations; header comment updated).
- `apps/api/prisma/migrations/<ts>_r0_domain/migration.sql` (generated + raw SQL).
- `apps/api/src/platform/prisma/user-scope.domain.ts` (lists + comment).
- `apps/api/test/factories/{job,application,application-event,reminder,import-session,idempotency-record}.ts` (+ index registry).
- `apps/api/test/integration/r0-schema.test.ts` (AC 2–7); extend user-scope extension tests (AC 8).
- Possibly `.squawk.toml` (Decision 11 only).

## Steps (one commit each; tests written first and seen failing)
1. **Constraint tests (red).** `r0-schema.test.ts` with raw `withPg` inserts as `applyra_app` + `sqlState` helper; fails on missing tables. Not committed alone — lands with step 2.
2. **Schema + migration** (`feat(db): R0 domain schema (M1-01)`): edit `schema.prisma`; `pnpm db:migration r0_domain` (local DB may need a reset first — CONTEXT §6 M0-11; else `prisma migrate diff --from-migrations … --to-schema … --script` into the new folder); hand-edit the untracked SQL: header comment, `SET lock_timeout = '5s'; SET statement_timeout = '60s';` on top, CHECK block at the end; register models in `user-scope.domain.ts`; `pnpm db:migrate` (never `migrate dev`/bare deploy — the skill's step 6 is outdated); drift diff = 0; local squawk on the file; step-1 tests green.
3. **Factories + cascade/tenancy/privilege tests** (`test(db): R0 factories + cascade tests`): factories with seeded rng (A owns, B foreign) for M1-04+; AC 4–7.
4. **Guard tests** (`test(prisma): user-scope guard for R0 models`): AC 8.
5. **Docs** (`docs: M1-01 schema notes`): list below. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` green.

## Security notes
- Every user-owned table has `userId` (Job: `ownerId`) + an index leading with it; the guard (Decision 15) is a safety net, `findOwned*` + IDOR fixtures (M1-04+) remain primary.
- Composite FK (Decision 5) makes a cross-tenant event impossible at the DB level.
- `descriptionText`, `notes`, event `payload` are untrusted user text: stored raw, rendered as plain text (M1-16); `descriptionHtml` stays NULL in R0. JSONB shapes validated by contracts Zod at the boundary (M1-02).
- `IdempotencyRecord.responseJson` may hold user data → retention 24 h (05 §8); R0 has no cleanup job: M1-03 treats `expiresAt < now()` as absent (delete + reinsert in tx). Purge job = R1 follow-up.
- Migration runs as `applyra_maintenance` via `pnpm db:migrate` → app gets DML only by default privileges; no GRANT/REVOKE in this migration.

## Docs to update (implementer)
- `05-data-model.md` §4.2: `IdempotencyRecord.key` TEXT + CHECK, nullable `statusCode`/`responseJson`; `Application @@unique([id, userId])` + composite event relation; §5 note on event FK; §7.4 add the new R0 CHECKs; §4.7 rows for Decisions 5 and 7.
- `06-api.md` §4: "row claimed first in the mutation tx, completed before commit".
- `docs/CONTEXT.md`: §1 status (M1-01 done), §2 migrations line (`<ts>_r0_domain`), §3 modules row note (schema ready), §6 gotchas found (composite FK, squawk findings, drift notes); `docs/plans/mvp-tasks.md` M1-01 ✅.
- Owner follow-up (not docs/): `.claude/skills/prisma-migration/SKILL.md` steps 4/6 still say `migrate dev` — should say `pnpm db:migration` / `pnpm db:migrate`.

## Implementation notes (2026-11-19)
- Migrations: `20261119120000_r0_domain` + review fix `20261119130000_r0_domain_tenancy` (Reminder composite FK `(applicationId, userId)` → Application `(id, userId)` + `@@index([applicationId, userId])`, `reminder_channels_chk`). Decision 5's "not for Reminder" was wrong: Prisma 7.10 accepts an optional relation over (optional, required) fields; NULL `applicationId` skips the FK (MATCH SIMPLE).
- Extra CHECK names: `idempotency_status_code_chk`, `idempotency_key_format_chk` (split out of the response pair). No `job_salary_currency_chk`: 08 §7.1 parseSalary yields currency `null` for unknown currencies → rule lives in Zod for the manual form (M1-04).
- Squawk: `ban-char-field` excluded globally (D11); the tenancy migration uses inline `squawk-ignore` (table created in the same release, empty everywhere).
- Carried into task ACs (mvp-tasks): M1-06 `findAccessibleJob` before linking `jobId` + IDOR; M1-03 route+hash match on replay, deterministic 4xx in a separate tx, expired record = absent (purge-on-access); M2-02 expired session → `rows = NULL` on access. Scheduled purge stays R1 per 05 §8 (R0 has no workers).

## Follow-ups
- M1-03: claim-first insert + `SET LOCAL lock_timeout = '5s'` → `409 IDEMPOTENCY_IN_PROGRESS`; deterministic 4xx stored after rollback in a separate tx.
- R1: retention purge (IdempotencyRecord, ImportSession.rows), trigram/FTS on Job, AuditLog REVOKE.
