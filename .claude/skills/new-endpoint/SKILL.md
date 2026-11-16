---
name: new-endpoint
description: Add a new REST endpoint to the Applyra API end to end (contract schema → controller → service/domain → repository → tests incl. IDOR → web client hook). Use when adding or changing an API route.
argument-hint: "<METHOD> <path> — short purpose"
---
# New endpoint: $ARGUMENTS

1. **Spec check.** Find the endpoint in `docs/spec/06-api.md` and its FR in `03-functional.md`. If it is not in the spec, stop and ask.
2. **Contract** (`packages/contracts`): request/query/response Zod schemas + inferred types. Reuse existing enums. Cursor pagination returns `{ items, nextCursor }`.
3. **Test first** (domain + integration): write failing tests — domain rule unit tests, then Supertest integration: happy path, validation error (400 with the `06-api.md` error shape), unauthenticated (401), IDOR (user B → user A's resource → 404). Run them and confirm they fail for the right reason.
4. **Domain**: pure rules in `<module>.domain.ts`.
5. **Repository**: user-scoped `findOwned*`/`updateOwned*`; related writes inside one transaction; outbox event if there is an async cross-module effect.
6. **Service**: orchestration only; idempotency via `Idempotency-Key` if the mutation is retryable.
7. **Controller**: route under `/api/v1`, auth guard, `@CurrentUser`, `nestjs-zod` DTO from contracts, maps to the response schema.
8. **Module public API**: export only what other modules need from `index.ts`.
9. **Web** (if the UI needs it now): typed client function + TanStack Query hook with key factory in `apps/web/src/features/<feature>/api/`.
10. **Verify**: `pnpm --filter api lint typecheck test` (and `--filter web` if touched). Then ask `security-reviewer` and `code-reviewer` to review the changed files.
11. **Docs**: update `docs/CONTEXT.md` module status if a module changed state.
