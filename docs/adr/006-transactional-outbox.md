# 006. Transactional outbox (from R1); synchronous side effects in R0

- Status: Accepted
- Date: 2026-11-16

## Context
- Asynchronous cross-module effects (matching recalculation, notifications, parsing, hard delete) must not be lost or duplicated when the DB write commits but the queue publish fails (SPEC D11).
- R0 has one side effect (`ApplicationNextActionSet` → reminder upsert) and no worker; review A-03 found the outbox scheduled for R1 while R0 needed it.
- Review A-04: the original relay held a transaction open during publish and lacked attempts, backoff, error, retention, partial index and fan-out.
- Event list and consumers: `docs/spec/04-architecture.md`; table: `docs/spec/05-data-model.md`.

## Decision
- **R0:** side effects run **synchronously in the same DB transaction** as the change (reminder upsert). No outbox, no worker.
- **R1+:** domain events are written to `OutboxEvent` in the same transaction as the data change; a relay in the worker publishes them to **BullMQ**.
- Relay design (A-04):
  1. **Claim** — short transaction: select due rows (`publishedAt IS NULL AND nextAttemptAt <= now()`) `FOR UPDATE SKIP LOCKED`, mark claimed, **commit**.
  2. **Publish** — outside any DB transaction; fan-out one BullMQ job per consumer with `jobId = eventId:consumer` (BullMQ dedups re-publishes).
  3. **Mark** — set `publishedAt`; on failure increment `attempts`, set `nextAttemptAt` (backoff) and `lastError`; after max attempts the row stays unpublished for inspection/alert.
- Poll interval 1–2 s; partial index on unpublished rows; published rows deleted after 7 days.
- Consumers are idempotent (dedup by `eventId`); delivery is at-least-once.

## Alternatives considered
- Outbox from R0 — needs worker + relay before there is a single async consumer; delays R0.
- Publish to BullMQ directly after commit — lost events on crash between commit and publish.
- pg-boss / graphile-worker (Postgres-native queues; enqueue in the same transaction, no relay) — rejected: Redis is already required (cache, rate limits, BullMQ), BullMQ is the fixed queue in the stack with job schedulers and Bull Board, and the outbox pattern is an explicit portfolio goal. Trade-off accepted: we maintain a relay.
- CDC (Debezium / logical replication) — extra infrastructure, overkill on one VPS.

## Consequences
- Positive: no lost events; publish failures never block or roll back user requests; replayable events.
- Negative / trade-offs: extra table, relay process and latency of up to the poll interval; at-least-once requires idempotent consumers everywhere.
- Follow-ups: integration test of the relay with Testcontainers. Resolved in the spec: `maxAttempts = 10`, backoff `min(2^attempts s, 5 min)`, alerts (ADR 013); the reminder upsert stays a synchronous in-transaction call in R1+ (it needs consistency), it is not moved to a consumer (`docs/spec/04-architecture.md` §5.1).
