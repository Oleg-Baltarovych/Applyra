# 026. Pivot to a daily vacancy digest

- Status: Accepted
- Date: 2026-11-19

## Context

Applyra was designed as a full job-search workspace (spec v2.1: NestJS API + React SPA + Postgres/Valkey,
CRM Kanban, reminders, matching, AI helpers; ADRs 000–025; M0 scaffold + M1-01/02 done). For a solo owner
who mainly needs to *find* relevant vacancies, that scope is far too heavy to build and to host, and the
real daily pain — checking several Ukrainian job sites by hand — is not solved until late milestones.

## Decision

Applyra becomes one thing: a **daily Telegram digest** of new vacancies from Ukrainian job sites, filtered
and ranked by a committed profile file, run by **GitHub Actions cron** with no hosting and no database
(`docs/spec.md`).

- One package `apps/digest`: Node 26 ESM TypeScript run directly by Node (type stripping, no build), Vitest.
- Pipeline fetch → normalize → dedup → filter/score → format → send; pure logic separated from I/O.
- State (sent ids, 30-day TTL) is a JSON file kept in the Actions cache.
- Sources are public feeds only (DOU, Djinni RSS first); no ToS/auth/CAPTCHA bypass.
- Everything else is deleted (apps/api, apps/web, packages/contracts, e2e, infra, deploy/terraform
  workflows, old spec/plans/ADRs, CRM-specific agent rules and skills).

## Alternatives considered

- Keep the CRM plan and add the digest as a module — keeps the hosting/DB cost and months of work before value.
- Hosted bot (VPS/serverless + DB) — more moving parts and cost for one user and one run per day.
- Third-party alert e-mails from each site — no unified ranking, no cross-site dedup, noisy.

## Consequences

- Positive: value from the first real source; no infrastructure to run or pay for; small codebase.
- Negative: Actions cron is best-effort (delays of minutes are normal); cache eviction after 7 idle days
  can resend recent vacancies once; feed formats can change without notice (tests with recorded fixtures).
- ADRs 000–025, spec v2.1 and all plans are archived under the git tag `archive/crm-plan-v0`; numbering
  continues from 026.
- Follow-ups: DOU and Djinni adapters with recorded fixtures; optional LLM re-ranking behind its own ADR.
