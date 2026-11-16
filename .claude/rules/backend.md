---
paths:
  - "apps/api/src/**/*.ts"
---
# Backend (NestJS) rules — SPEC §6.2, §10, §22

- Layering: controller (HTTP only: parse, auth context, call service, map response) → service (orchestration, transactions) → `*.domain.ts` (pure functions, no Nest/Prisma imports).
- Prisma is used only in repositories/services, never in controllers or domain files.
- Cross-module import only via `src/modules/<name>/index.ts`. Async side effects across modules = outbox event written in the same transaction.
- User-scoped reads/writes go through `findOwned*` / `updateOwned*` helpers (`where: { id, userId }`). Not found or foreign → `NotFoundException` (404).
- Multiple related writes = one `prisma.$transaction`.
- Input validation via `nestjs-zod` with schemas imported from `@applyra/contracts`; never re-declare DTO shapes locally.
- Errors follow the SPEC §10.1 shape (`statusCode, code, message, details, requestId`). No stack traces, SQL, or internal IDs in responses.
- Retryable mutations accept `Idempotency-Key`. BullMQ jobs use a stable `jobId`; consumers dedup by `eventId`.
- Config: read through the Zod-validated config service only, never `process.env` directly.
- Logging: pino logger, never `console.*`. Never log fields from the SPEC §11.6 redaction list.
- Worker processors call the same services as HTTP; no business logic in processors.
