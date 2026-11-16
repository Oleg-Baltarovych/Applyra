# 001. Modular monolith with a worker entrypoint

- Status: Accepted
- Date: 2026-11-16

## Context
- One developer, ~15–20 h/week; releases R0 → R3 must each be deployable (see `docs/spec/02-releases.md`).
- Background work exists from R1 (outbox relay, email, parsing); R0 runs no worker container and grows in R2 (ingestion, matching).
- Business logic must not be duplicated between HTTP handlers and background jobs (SPEC D10).
- Architecture details: `docs/spec/04-architecture.md`.

## Decision
`apps/api` is a NestJS **modular monolith** with two entrypoints from one codebase: `main.ts` (HTTP) and `worker.ts` (BullMQ processors).
- Module = NestJS module in `src/modules/<name>` with a public `index.ts`; importing another module's internals is forbidden and enforced by ESLint (`eslint-plugin-boundaries`, chosen in `docs/spec/04-architecture.md` §4.1).
- Controllers are HTTP-only; business rules live in services and pure `*.domain.ts` functions without Nest/Prisma dependencies.
- Asynchronous cross-module side effects go through domain events (outbox, ADR 006); the worker calls the same services.
- Module list reduced per review A-23: `companies` and `search` merged into `jobs`, `dedup` merged into `ingestion`.
- Shared infrastructure: one PostgreSQL, one Redis, one S3-compatible bucket.

## Alternatives considered
- Microservices — distributed transactions, per-service deploy/CI/observability and network contracts are pure overhead for one developer and MVP-scale data; no independent scaling need exists.
- Separate worker codebase/package — duplicates domain logic or forces an extra shared package; violates D10.
- Single process (HTTP + queues in one) — long jobs (ingestion, parsing) would compete with request latency; no separate restart/scaling.
- Serverless functions — cold starts, poor fit for BullMQ and long-running ingestion.

## Consequences
- Positive: one build, one deploy artifact (two commands), refactor-safe module boundaries, straightforward testing.
- Negative / trade-offs: one shared DB schema; boundary discipline relies on lint rules; a bad deploy affects all modules.
- Extraction criteria (when a module may become a separate service): sustained independent scaling need (e.g. ingestion CPU/IO starving the API), a different runtime/language requirement, a separate team owning it, or isolation needed for security (e.g. untrusted-content processing). Until then, scale by running more worker replicas.
- Follow-ups: none open (lint tool chosen: `eslint-plugin-boundaries`).
