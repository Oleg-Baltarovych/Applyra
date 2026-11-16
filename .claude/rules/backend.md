---
paths:
  - "apps/api/src/**/*.ts"
---
# Backend (NestJS) rules — `docs/spec/04-architecture.md`, `06-api.md`

- Layering: controller (HTTP only: parse, auth context, call service, map response) → service (orchestration, transactions) → `*.domain.ts` (pure functions, no Nest/Prisma imports).
- Prisma is used only in `*.repository.ts` (enforced by eslint-plugin-boundaries), never in services, controllers or domain files.
- Cross-module import only via `src/modules/<name>/index.ts`. Cross-module side effects: R0 — synchronous call inside the same transaction; from R1 — outbox event written in the same transaction (ADR 006).
- User-scoped reads/writes go through `findOwned*` / `updateOwned*` helpers (`where: { id, userId }`). Not found or foreign → `NotFoundException` (404).
- Multiple related writes = one `prisma.$transaction`.
- Input validation via `nestjs-zod` with schemas imported from `@applyra/contracts`; never re-declare DTO shapes locally.
- Errors follow the `06-api.md` error shape and code catalogue (`statusCode, code, message, details, requestId`). No stack traces, SQL, or internal IDs in responses.
- Retryable mutations accept `Idempotency-Key`. BullMQ jobs use a stable `jobId`; outbox consumers are idempotent per `04-architecture.md` §5 (natural keys / upserts).
- Config: read through the Zod-validated config service only, never `process.env` directly.
- Logging: pino logger, never `console.*`. Never log fields from the redaction list in `09-security-privacy.md`.
- Worker processors call the same services as HTTP; no business logic in processors.
