---
paths:
  - "apps/api/prisma/**"
  - "**/*.repository.ts"
---
# Prisma & database rules — `docs/spec/05-data-model.md`, `12-infra-ops.md`

- Never edit an existing folder in `prisma/migrations/` (a hook blocks it). Schema change → `prisma migrate dev --name <snake_case>` → new migration. Use `/prisma-migration`.
- Declare in `schema.prisma` what Prisma 7 generates itself (verified in M0-03): partial unique `@@unique(where: raw(...))` (preview `partialIndexes`), trigram `@@index([col(ops: raw("gin_trgm_ops"))], type: Gin)`, GIN on `Unsupported("tsvector")`. A generated column is `Unsupported("tsvector")? @default(dbgenerated())` (otherwise false drift).
- Raw SQL Prisma cannot express is added by hand to the generated migration, with a comment: at the top — `SET lock_timeout`/`statement_timeout`, `CREATE EXTENSION`, helper functions (`f_unaccent`), and the `GENERATED ALWAYS AS (...) STORED` column definition; at the end — CHECK constraints and grants. Then `migrate diff --exit-code` must report no drift.
- Enums: one value per line (single-line `enum X { A B }` fails validation).
- Migrations are backward compatible (expand → migrate → contract). Never drop/rename a column the deployed code still reads.
- PKs UUID v7; timestamps `timestamptz`; money = integer + `currency CHAR(3)` + `period`.
- Every user-owned table has `userId` and an index starting with `userId`. Repositories of user-owned models expose `findOwned*`-style methods only.
- `$queryRaw` only via typed helpers with tagged templates. Never `$queryRawUnsafe` with interpolated input.
- After schema changes: `prisma generate`, then run the affected repository's integration tests (Testcontainers).
