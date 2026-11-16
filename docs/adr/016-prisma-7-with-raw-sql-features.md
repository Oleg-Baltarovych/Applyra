# 016. Prisma 7 with raw SQL for Postgres-specific features

- Status: Accepted
- Date: 2026-11-16

## Context
- The schema relies on features Prisma does not model natively: generated `tsvector` column, trigram GIN indexes, partial unique indexes, CHECK constraints, `vector` (R3) (see `docs/spec/05-data-model.md`).
- Review A-10: such objects created only in raw SQL make Prisma report drift and may be dropped by later generated migrations.
- Review §5: Prisma 7 is GA; it requires `prisma.config.ts`, a driver adapter (`@prisma/adapter-pg`), an explicit generator `output`, does not auto-load `.env`; NestJS (CJS) needs the CJS client format. Partial indexes are preview since 7.4. Prisma 8 is RC.

## Decision
Use **Prisma 7.x** as ORM and represent Postgres-specific objects in the schema where possible, raw SQL elsewhere.
- `prisma.config.ts` at the api package; driver adapter `@prisma/adapter-pg`; explicit client `output`; CJS client format for Nest; env loaded explicitly.
- `search_vector` declared as `Unsupported("tsvector")`; `vector` as `Unsupported("vector")` (R3) with `$queryRaw`.
- Trigram indexes declared with `ops: raw("gin_trgm_ops")`.
- Partial indexes via the `partialIndexes` preview feature (7.4+).
- Remaining objects (CHECK constraints, `f_unaccent`, generated expressions) in raw SQL migrations.
- Queries Prisma cannot express (FTS, similarity, vector) go through typed `$queryRaw` helpers with Zod-validated rows.
- CI: `prisma migrate diff --exit-code` fails the build on drift; applied migrations are never edited.
- Prisma enums for enumerated columns, aligned with contracts (review A-12).

## Alternatives considered
- Drizzle — closer to SQL, but Prisma is the fixed stack choice and its migrations/client are well known to reviewers.
- Kysely / raw SQL only — no schema-first migrations; more boilerplate.
- Prisma 6 — no reason to start on the previous major.
- Prisma 8 — RC, not used until GA.

## Consequences
- Positive: type-safe client for 90 % of queries; drift detected in CI; Postgres features not sacrificed.
- Negative / trade-offs: preview feature risk (partial indexes); `Unsupported` columns are invisible to the client; raw helpers need their own integration tests.
- Follow-ups: migration linting with squawk and `lock_timeout` (review I-03); migration tests (T-03); verify Testcontainers flow with the driver adapter.
