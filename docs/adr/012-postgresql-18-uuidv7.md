# 012. PostgreSQL 18 with native UUID v7

- Status: Accepted
- Date: 2026-11-16

## Context
- Data principle: UUID v7 primary keys (time-ordered → better B-tree locality than v4) (see `docs/spec/05-data-model.md`).
- Review A-02: nothing actually generated UUID v7; Better Auth generated text ids.
- SPEC v2.0 targeted "PostgreSQL 16+" with extensions `pg_trgm`, `unaccent`, `vector` (R3).
- Postgres runs in a container on our own VPS (ADR 011), so the version is our choice.

## Decision
Use **PostgreSQL 18** and its native **`uuidv7()`** function as the default for all primary keys.
- Domain tables: `id uuid DEFAULT uuidv7()` (via Prisma `@default(dbgenerated("uuidv7()")) @db.Uuid`).
- Better Auth tables use the same type; Better Auth `generateId` produces UUID v7 in the application (ADR 007).
- Extensions: `pg_trgm`, `unaccent` from R0 (normalised titles, trigram index); `vector` (pgvector) in R3.
- Local, CI (Testcontainers) and production use the same major version image.

## Alternatives considered
- PostgreSQL 16/17 + Prisma `@default(uuid(7))` — ids generated only by Prisma Client; raw SQL inserts and other writers would not get defaults.
- PostgreSQL 16/17 + `pg_uuidv7` extension — extra extension to install and maintain.
- UUID v4 — random inserts, worse index locality.
- bigint identity — leaks counts, harder to merge/generate client-side.

## Consequences
- Positive: one id format across auth and domain; DB-side default works for raw SQL and migrations.
- Negative / trade-offs: requires a PG 18 image wherever the DB runs; pgvector must be available for PG 18 by R3.
- Follow-ups: confirm the exact Prisma syntax for the default at scaffolding (stack table in `docs/spec/04-architecture.md` §7 already says 18).
