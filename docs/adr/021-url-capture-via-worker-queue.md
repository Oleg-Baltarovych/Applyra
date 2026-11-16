# 021. URL capture via a worker queue (synchronous for the client)

- Status: Accepted
- Date: 2026-11-16

## Context
- `POST /jobs/capture` (FR-JOB-07, R1) returns a `JobDraft` synchronously (`docs/spec/06-api.md` §8); NFR: p95 ≤ 6 s, measured as `bullmq_job_duration_seconds{queue="capture"}` (`docs/spec/12-infra-ops.md` §12).
- `safe-fetcher` is reachable only on the `fetch-rpc` network, which only the worker joins (ADR 009, `docs/spec/12-infra-ops.md` §3.2). The plan review (G-02) found that the API had no path to the fetcher.
- Putting the API on `fetch-rpc` would widen the SSRF blast radius: the internet-facing process would gain a route to the fetcher.

## Decision
- The API stays off `fetch-rpc`. `POST /jobs/capture` enqueues a BullMQ job on the `capture` queue and awaits its completion for ≤ 6 s (`job.waitUntilFinished(queueEvents, 6000)`); the client sees a synchronous response.
- Stable `jobId = capture-<sha256(userId|canonicalUrl)>` (no `:`, never all digits, as BullMQ requires): a double submit joins the same job instead of fetching twice. Completed jobs are kept briefly (`removeOnComplete: { age: 300 }`) and failed jobs are removed at once, so a retry runs again.
- The worker runs fetch via `safe-fetcher` over `fetch-rpc` → JSON-LD → `extract-job` through the AI executor (ADR 017). Then it returns the draft as the job result. Nothing is persisted until the user confirms.
- Errors: page unavailable, blocked, or timed out at the fetcher → `422 CAPTURE_UNAVAILABLE`. API wait > 6 s → `504 CAPTURE_TIMEOUT`, which is not stored for `Idempotency-Key` replay (5xx), so retry is allowed. If the job is still running, the retry joins it.
- `capture` is a command queue, not a domain event; it does not go through the outbox (ADR 006).

## Alternatives considered
- API joins `fetch-rpc` and calls the fetcher directly: simpler and lower latency, but the public process gains a route to the SSRF-sensitive component. Rejected.
- Async capture (`202` + polling or SSE): more robust under load, but adds UI states and an endpoint for a ≤ 6 s operation. Deferred; this is the fallback if p95 cannot be met.
- Fetcher inside the API process: defeats the network isolation in ADR 009.

## Consequences
- Positive: network isolation is kept, and the NFR metric measures the real path. Idempotency comes from `jobId`, and worker concurrency caps the global number of parallel fetches (5, `docs/spec/09-security-privacy.md` §5).
- Negative / trade-offs: capture depends on the worker and Redis being up (otherwise `504`). The API holds a request for up to 6 s, and each API instance needs a `QueueEvents` connection.
- Follow-ups: integration test (Testcontainers Redis + stub fetcher) for success, timeout → 504, and duplicate submit → one fetch; alert if `capture` waiting jobs grow.
