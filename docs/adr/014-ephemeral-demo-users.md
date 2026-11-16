# 014. Ephemeral demo users

- Status: Accepted
- Amended: 2026-11-16 — by ADR 022: demo sign-in is also the no-Google sign-in path for local/Codespaces from R0 (`DEMO_ENABLED=true` in local by default; FR-DEMO-01 in R0); Turnstile/limits/restrictions/purge stay R1 and are required before demo is enabled on any public host
- Date: 2026-11-16

## Context
- R1 exit criterion: a recruiter or engineer opens the link, clicks "Try demo" without registration and understands the product in 2 minutes (see `docs/spec/02-releases.md`).
- SPEC v2.0 planned one shared demo account reset nightly.
- Review S-15 / P-16: with a shared account visitors see and break each other's data, can plant XSS-style content, burn the AI budget and use URL capture as an SSRF/abuse vector.

## Decision
Every demo visitor gets their **own ephemeral demo user** with seeded synthetic data and a **24-hour TTL**.
- Created on "Try demo"; a demo user is a normal `USER` (`User.role` is `USER | ADMIN`) identified by `User.demoExpiresAt IS NOT NULL`; a normal session cookie (ADR 008).
- Seeded synthetic data only (applications, jobs, reminders); no real people.
- Disabled for demo users: document uploads, URL capture, outbound email.
- AI for demo users: `StubProvider` by default; live only behind a hard per-user limit plus a **global daily demo cap in USD** (`AiGlobalUsageDaily`, scope `DEMO`).
- Expired demo users are hard-deleted by a scheduled job through the normal deletion pipeline (ADR 015).
- Same authorization rules and IDOR guarantees as for real users — demo users are isolated from each other.

## Alternatives considered
- Shared demo account reset nightly — cross-visitor data exposure and vandalism (S-15).
- Read-only shared demo — visitors cannot try the core flows (drag on Kanban, add job).
- Video/screenshots only — weaker portfolio impression.

## Consequences
- Positive: isolation by construction; abuse surface limited (no uploads/fetch/email); AI cost bounded.
- Negative / trade-offs: user rows created per visitor; needs creation rate limiting and a cleanup job; seed must stay in sync with the schema.
- Follow-ups: whether demo users appear in product analytics/metrics. Resolved in the spec: Turnstile + ≤ 3 demos/day per IP, ≤ 200 active (`docs/spec/09-security-privacy.md` §11); stub by default and USD caps as env defaults (`docs/spec/07-ai.md` §4).
