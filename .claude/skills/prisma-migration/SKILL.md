---
name: prisma-migration
description: Change the Applyra database schema safely — edit schema.prisma, generate a new migration, add the raw SQL Prisma cannot express (extensions, generated columns, CHECK, grants), and verify no drift. Use for any schema or index change.
argument-hint: "<migration_name_snake_case> — what changes"
---
# Prisma migration: $ARGUMENTS

1. Read the model in `docs/spec/05-data-model.md` (`grep -n "model <Name>"`) and its principles section. Do not invent fields that contradict it; once `apps/api/prisma/schema.prisma` exists it is the source of truth for columns.
2. Check backward compatibility: is any column dropped/renamed/made NOT NULL that deployed code reads? If yes, split into expand → migrate → contract migrations and explain the plan before continuing.
3. Edit `apps/api/prisma/schema.prisma` (UUID v7 ids, `@db.Timestamptz(3)`, `userId` + index on user-owned models, enum values one per line). Partial unique (`where: raw(...)`), trigram (`ops: raw("gin_trgm_ops")`) and GIN on `Unsupported("tsvector")` go in the schema — Prisma 7 generates them (see `.claude/rules/prisma.md`).
4. Generate: `pnpm db:migration <name>` (= `migrate dev --create-only` against the shadow DB; needs `MAINTENANCE_DATABASE_URL` + `SHADOW_DATABASE_URL`). If it asks to reset a local DB with a stale checksum, don't reset — use `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` into a new `<ts>_<name>/migration.sql` instead.
5. Open the new (untracked) `migration.sql` and add the raw SQL Prisma cannot express, each block commented with its purpose: at the top `SET lock_timeout`/`statement_timeout`, `CREATE EXTENSION`, helper functions, `GENERATED ALWAYS AS (...) STORED` column definitions; at the end CHECK constraints (e.g. `-- check: PUBLIC jobs have no owner`) and grants.
6. Apply and generate: `pnpm db:migrate` (the only apply path — never `migrate dev` or bare `migrate deploy`: they skip the `_prisma_migrations` REVOKE) then `pnpm --filter @applyra/api db:generate`.
7. Verify no drift: `pnpm --filter @applyra/api exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` (Prisma 7 flags — confirm with `prisma migrate diff --help`) exits 0.
8. Run the affected repository integration tests. Add tests for new constraints (e.g. violating the partial unique index fails).
9. Never edit previously applied migration folders — create a new one to fix mistakes.
