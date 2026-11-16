---
paths:
  - "apps/api/prisma/**"
  - "**/*.repository.ts"
---
# Prisma & database rules — `docs/spec/05-data-model.md`, `12-infra-ops.md`

- Never edit an existing folder in `prisma/migrations/` (a hook blocks it). Schema change → `prisma migrate dev --name <snake_case>` → new migration. Use `/prisma-migration`.
- Raw SQL that the Prisma schema cannot express (FTS `search_vector`, GIN/trigram indexes, partial unique indexes, CHECK constraints, extensions) is appended by hand to the generated migration SQL, with a comment.
- Migrations are backward compatible (expand → migrate → contract). Never drop/rename a column the deployed code still reads.
- PKs UUID v7; timestamps `timestamptz`; money = integer + `currency CHAR(3)` + `period`.
- Every user-owned table has `userId` and an index starting with `userId`. Repositories of user-owned models expose `findOwned*`-style methods only.
- `$queryRaw` only via typed helpers with tagged templates. Never `$queryRawUnsafe` with interpolated input.
- After schema changes: `prisma generate`, then run the affected repository's integration tests (Testcontainers).
