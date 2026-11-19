# 025. Scope: R0 unchanged + R1-lite

- Status: Accepted
- Date: 2026-11-19
- Decided by: owner
- Amends: ADR 006 (outbox not needed in R1-lite), ADR 014 (demo restrictions apply only when hosted), ADR 017 (one provider adapter, no head-to-head selection), ADR 018 (a subset of matching v1 moves from R2 to R1-lite). Spec: `docs/spec/02-releases.md` §2.2, §2.5, §3, §4, §5.2.

## Context
- Applyra is a solo portfolio project at ~15–20 h/week. After ADR 022, `docs/plans/mvp-tasks.md` still holds ~70 h of R0 work left and ~190 h for R1 (186 core + 4 optional) — roughly 10–12 more weeks after R0 before anything new is shown.
- Many R1 blocks (email/password auth, notifications, contacts/interviews, documents, analytics/dashboard, privacy pipelines, demo anti-abuse, Prometheus/Grafana) only matter for a hosted multi-user product, which ADR 022 already postponed.
- What a reviewer remembers is a few strong features: SSRF-safe URL capture, a guarded LLM step, an explainable match, all tested end to end.

## Decision
R0 stays as planned. R1 is replaced by **R1-lite** (~68 h: 67 core + 1 optional). Everything else from M3–M5 moves to `Later — after R1-lite` in `mvp-tasks.md`. IDs are kept.

**Kept in R1-lite:**
- Platform: M3-01 worker entrypoint (required: ADR 021 has the worker call safe-fetcher; the API never joins `fetch-rpc`). M3-03 AuditLog (2 h; keeps DoD §5.2 "sensitive actions audited", needed for `AI_SETTINGS_CHANGED`).
- Capture: M3-20 safe-fetcher, M3-21 capture API, M3-22 web.
- AI: M4-19 executor/budgets, M4-20 `extract-job` + golden set, M4-21 **narrowed to one provider adapter**, M4-22 capture LLM fallback, M4-23 AI settings + usage.
- Profile & skills (narrowed): M4-01 schema (`Skill`, `SkillAlias`, `UserSkill`, `CareerProfile`, `JobSkill`; no `Experience/Education/Language`), M4-02, M4-03 (`GET/PATCH /profile` for seniority, target roles, work modes, employment types only), M4-04, M4-05 (minimal Profile page), M4-06, M4-08 (synchronous extraction, no outbox).
- Matching-lite (new): M4-24 domain + `GET /jobs/:id/match`, M4-25 web badge + "Why?".
- Launch: M3-23, M3-24, M3-25, M5-21 (narrowed to `@smoke`), M5-22 OpenAPI ↔ routes (needed for the OWASP API9 [R1] control in `09-security-privacy.md` and `11-testing.md`), M5-25, M5-26 (narrowed to `/bot` + R1-lite data flows), M5-27, M5-28 (renamed "R1-lite release"); M5-14 optional (Sentry web/worker by DSN only).

**Design decisions that come with the scope:**
1. **No outbox in R1-lite.** Dictionary skill extraction (`skills.extractFromText`, pure) runs synchronously inside the job create/update transaction (jobs service → skills `index.ts`). M3-02/M3-02b/M3-19 are deferred. R0's synchronous side effects (A-03) stay as they are.
2. **Matching-lite is computed when read, not stored.** Pure `matching/score.domain.ts` uses the 08 §8.1 components whose inputs exist without FX or hard filters: Skills 0.35, Seniority 0.20, Work mode 0.15 (location ignored), Employment type 0.05. Confidence = Σw(known) / 0.75. `excluded` is always false (no hard filters yet). `algorithmVersion = 'v1.0-lite'`. Explanation shape = `MatchExplanation` (08 §8.3). Golden set ≥ 20 pairs. No `MatchScore` table, triggers, debounce or `inputsHash`. Those come with R2 matching v1.
3. **Jobs list/search is not needed** to show matches. The match appears in the Application detail drawer (job section). M4-07/09–13 are deferred.
4. **Captured descriptions are stored as plain text** (`descriptionText`; `descriptionHtml` stays null). Sanitized HTML (M4-11, FR-DISC-05) is deferred, so no HTML rendering path exists in R1-lite.
5. **One LLM provider.** The owner picks the provider before M4-21. Acceptance is the golden set reaching a pass-rate threshold on that provider (not a comparison of candidates). No-training/retention terms go into the ADR 017 follow-up. `AIProvider` stays swappable.
6. **Demo stays local-only** (M2-12 production guard on `DEMO_ENABLED` is unchanged). Demo users may use URL capture (their own machine/Codespace egress). AI for demo users uses `StubProvider` (07-ai §4.3, part of M4-19). Turnstile, caps, `no-demo` guards and purge (M5-12/13, FR-DEMO-02…05) come back with hosting.
7. **Auth stays Google OAuth + demo sign-in.** E2E signs in through demo sign-in (two demo users for the IDOR flow).
8. **Privacy pages:** keep the `/bot` page (the `ApplyraBot` UA points to it) and a short data-flow page covering the LLM provider, AI settings and local backups. The full policy (exports, deletion, email) comes with hosting.

**Deferred (`Later — after R1-lite`), one reason each in `mvp-tasks.md`:** outbox (M3-02, M3-02b, M3-19); email + password auth, sessions UI, re-auth (M3-04…M3-10); stale hints, timeline edit, contacts, interviews/.ics, custom reminders (M3-11…M3-16); notification centre and delivery (M3-17, M3-18, M5-06, M5-07); Jobs search/list/detail, UserJob, sanitized HTML (M4-07, M4-09…M4-13); documents (M4-14…M4-18); analytics/dashboard/R1 navigation/onboarding R1 (M5-01…M5-05); async export, account deletion, retention, Settings → Data (M5-08…M5-11); demo restrictions/purge (M5-12, M5-13); metrics + Prometheus/Grafana (M5-15, M5-16); k6/Lighthouse, admin TOTP/Bull Board (M5-23, M5-24); remainders of narrowed tasks (M4-03b, M4-05b, M4-21b, M5-21b, M5-26b).

## Alternatives considered
- **Keep full R1 (~190 h).** Another 10–12 weeks of mostly hosted-product features that nobody else uses.
- **Stop at R0.** No worker, no SSRF, no AI and no matching: the main engineering showcase would be missing.
- **R1-lite with the outbox and persisted MatchScore.** Closer to the final architecture, but +8–10 h of infrastructure without a visible feature. The outbox comes back with the first consumer that needs it (notifications/documents).

## Consequences
- Positive: R1 ~190 h → R1-lite ~68 h (~4–5 weeks after R0). The release shows the hardest parts (SSRF isolation, LLM safety and budgets, deterministic explainable scoring, E2E) without running a hosted product.
- Deferred FRs: FR-AUTH-05…10, FR-JOB-10, FR-APP-14…16, FR-REM-04…07, FR-INT-01…05, FR-PROF-02, FR-DOC-*, FR-DISC-01…05, FR-NOTIF-01…04, FR-DASH-03/04, FR-ANL-*, FR-PRIV-01/02, FR-DEMO-02…05. Partial in R1-lite: FR-PROF-03 (seniority, target roles), FR-PROF-05 (work modes, employment types; no hard filters/salary). Pulled forward from R2 as partial: FR-MATCH-01 (no exclusion), FR-MATCH-02, FR-MATCH-03, FR-MATCH-05 (golden set; versioned `v1.0-lite`).
- Gates changed: R1-lite release = M5-28 with the narrowed dependency list. The Grafana exit criterion is dropped. DoD §5.2 "new metrics/alerts" does not apply until Prometheus returns. AuditLog, integration tests, idempotent jobs and E2E stay.
- Security posture: no password auth means no password storage, HIBP, reset tokens or enumeration surface. Account linking does not exist. No email is sent. No file uploads (smallest attack surface). SSRF and LLM prompt injection are the main new risks and are covered by M3-20 fixtures, the M4-20 injection cases and the M5-28 audit. Demo is not exposed publicly, so the missing anti-abuse controls are acceptable.
- R2 now also depends on part of `Later — after R1-lite` (outbox, Jobs list/search, `UserJob`, full profile with hard filters/salary). That needs ~25–30 h extra when R2 is planned. Matching v1 extends matching-lite (persistence, triggers, salary/language/hard filters, feedback).
- R0 tasks that only prepare deferred work: M0-16 (presigned PUT spike, optional) — documents only, skip unless documents return. Mentions of R1 in M2-10 (restore runbook stub) and M2-12 (Turnstile/purge in M5-12/13) now point to Later. R0 scope is otherwise unchanged.
- Revisit when: (a) the decision to host is made (ADR 022 follow-ups bring back email/password auth, demo restrictions, privacy pipelines, observability), (b) R1-lite has shipped and the author still wants more features (pick items from Later by value), or (c) a real second user appears.
