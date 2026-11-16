---
name: prisma-migration
description: Change the Applyra database schema safely — edit schema.prisma, generate a new migration, append raw SQL (FTS, trigram, partial unique, CHECK), and verify. Use for any schema or index change.
argument-hint: "<migration_name_snake_case> — what changes"
---
# Prisma migration: $ARGUMENTS

1. Read the model in SPEC §8.2 (`grep -n "model <Name>" docs/SPEC.md`) and principles §8.1. Do not invent fields that contradict SPEC.
2. Check backward compatibility: is any column dropped/renamed/made NOT NULL that deployed code reads? If yes, split into expand → migrate → contract migrations and explain the plan before continuing.
3. Edit `apps/api/prisma/schema.prisma` (UUID v7 ids, `@db.Timestamptz`, `userId` + index on user-owned models).
4. Generate: `pnpm --filter api exec prisma migrate dev --name <name> --create-only` (ask the user before running; it touches the local DB).
5. Open the new `migration.sql` and append the raw SQL Prisma cannot express, each block commented with its purpose (e.g. `-- partial unique: one active application per job per user`).
6. Apply and generate: `pnpm --filter api exec prisma migrate dev` then `prisma generate`.
7. Verify no drift: `pnpm --filter api exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL"` reports no changes.
8. Run the affected repository integration tests. Add tests for new constraints (e.g. violating the partial unique index fails).
9. Never edit previously applied migration folders — create a new one to fix mistakes.
