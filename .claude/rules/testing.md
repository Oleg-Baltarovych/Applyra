---
paths:
  - "**/*.{test,spec}.{ts,tsx}"
  - "**/test/**"
  - "**/e2e/**"
---
# Testing rules — `docs/spec/11-testing.md`

- Unit (Vitest): pure `*.domain.ts`, parsers, normalizers, status transitions, reminder scheduling (timezones, DST, quiet hours). Domain coverage ≥ 90%.
- Integration (Vitest + Testcontainers Postgres/Redis/MinIO + Supertest): repositories, raw SQL, outbox relay, BullMQ processors, auth, uploads. Never mock Prisma in integration tests; isolate DB state per test file.
- Every private endpoint: happy path + validation error + IDOR (other user → 404).
- New private route → fixture in `apps/api/test/idor/fixtures.ts` or `@IdorExempt('reason')` on the handler (IDOR gate, `test/idor-gate.test.ts`).
- Frontend: Testing Library + MSW; query by role/label, not test ids or classes.
- E2E (Playwright): only the critical flows listed in `11-testing.md`. Role-based locators; no fixed `waitForTimeout`.
- A test must fail when the behaviour breaks. Assert outputs and side effects, not implementation calls. Delete tests that pass against an empty implementation.
- Test data via factories/builders; seeded randomness only; fake timers wherever dates matter.
- AI tasks: contract tests with a mocked `AIProvider`. Real-model evals live in `ai/evals/` and never run on PR CI.
