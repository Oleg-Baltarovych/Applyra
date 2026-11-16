# 013. Observability: Prometheus + Grafana, Sentry, OpenTelemetry later

- Status: Accepted
- Amended: 2026-11-16 — by ADR 022: Sentry SDKs are initialised only when `SENTRY_DSN` is set (no hosted Sentry required); Prometheus/Grafana/Alertmanager run as a local Compose profile in R1; uptime checks and release tagging on deploy — "when hosting"
- Date: 2026-11-16

## Context
- SPEC v2.0 observability: pino logs with `requestId`/`traceId` and redaction, Sentry, Bull Board, health endpoints, OpenTelemetry traces in R2; metrics listed (p95 latency, error rate, queue depth/failed, source health, AI cost/day) but no metrics stack.
- Review P-17: Prometheus/Grafana are resume strengths but invisible in the plan → metrics in R1.
- Review A-23 / decision §4.9: OpenTelemetry deferred.
- Self-hosted VPS (ADR 011) — no cloud-provided monitoring.
- See `docs/spec/12-infra-ops.md`.

## Decision
- **Logs (R0):** pino JSON via `nestjs-pino`, `requestId` in every line, redaction list from `docs/spec/09-security-privacy.md`.
- **Errors (R0/R1):** Sentry for web, api and worker; releases tagged on deploy.
- **Metrics (R1):** Prometheus scrapes `/metrics` of api and worker; **Grafana dashboards and alert rules are provisioned as code** in the repo.
- Initial metrics: HTTP p95 latency and error rate, queue depth and failed jobs, outbox backlog/failed events, AI cost per day; source health in R2.
- **Health:** `/health/live`, `/health/ready` (DB, Redis).
- **Traces (R2):** OpenTelemetry HTTP → Prisma → BullMQ (context propagated in job data) → worker.
- Bull Board behind admin guard, reachable only via tunnel (review S-19).

## Alternatives considered
- Grafana Cloud / Datadog / New Relic SaaS — cost or free-tier limits; less infra to show.
- Logs-only monitoring — no alerting on latency, queue backlog or AI spend.
- OpenTelemetry from R0 — instrumentation effort before there is a worker or a cross-process flow.

## Consequences
- Positive: alerting on the signals that matter (queues, outbox, AI cost) from R1; dashboards reviewable in PRs.
- Negative / trade-offs: Prometheus + Grafana consume VPS memory; alert routing must be configured and maintained.
- Follow-ups: alert channel (email/Telegram); retention period for metrics; where Prometheus/Grafana run (same VPS vs separate); Sentry data scrubbing and retention (ADR 015); log aggregation tool, if any.
