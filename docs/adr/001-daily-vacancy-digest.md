# 001. A daily vacancy digest in Telegram

- Status: Accepted
- Date: 2026-11-19

## Context

The owner, a solo developer looking for work, checks several Ukrainian job sites by hand every day. The real
need is to *find* relevant new vacancies quickly, not to run a job-search workspace, and it should cost nothing
to host.

## Decision

Applyra is a **daily Telegram digest** of new vacancies from Ukrainian job sites, filtered and ranked by a
committed profile file, run by **GitHub Actions cron** with no hosting and no database (`docs/spec.md`).

- One package `apps/digest`: Node 26 ESM TypeScript run directly by Node (type stripping, no build), Vitest.
- Pipeline fetch → normalize → dedup → filter/score → format → send; pure logic separated from I/O.
- State (sent ids, 30-day TTL) is a JSON file kept in the Actions cache.
- Sources are public feeds only (DOU, Djinni RSS first); no ToS/auth/CAPTCHA bypass.

## Alternatives considered

- A full job-search web app (API + SPA + database) — months of work and hosting cost before any value.
- Hosted bot (VPS/serverless + DB) — more moving parts and cost for one user and one run per day.
- Third-party alert e-mails from each site — no unified ranking, no cross-site dedup, noisy.

## Consequences

- Positive: value from the first real source; no infrastructure to run or pay for; small codebase.
- Negative: Actions cron is best-effort (delays of minutes are normal); cache eviction after 7 idle days
  can resend recent vacancies once; feed formats can change without notice (tests with recorded fixtures).
- Follow-ups: DOU and Djinni adapters with recorded fixtures; optional LLM re-ranking behind its own ADR.
