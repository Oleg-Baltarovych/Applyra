# 007. Authentication with Better Auth

- Status: Accepted
- Date: 2026-11-16
- Amended: 2026-11-16 — M0-02: Better Auth 1.7.25 + `@thallesp/nestjs-better-auth` 2.8 on NestJS 11 work without peer overrides; `generateId` → UUID v7 (`uuid` v7) for all auth models, `additionalFields` `role`/`demoExpiresAt` with `input: false`; allowlist hook must throw `APIError` with code `SIGNUP_CLOSED` (OAuth → `errorURL?error=SIGNUP_CLOSED`, programmatic → 403); `user.validateUserInfo` rejected because it also gates returning OAuth sign-ins
- Amended: 2026-11-16 — Google sign-up rejection is a redirect, not 403: the SPA passes `errorCallbackURL: '/sign-in'` and the sign-in page maps `?error=SIGNUP_CLOSED` to "Access is invite-only"; 403 `SIGNUP_CLOSED` applies only to direct API sign-up (email, R1) (FR-AUTH-02, `docs/spec/06-api.md` §7.1)

## Context
- Rule: no home-grown cryptography; sessions in HttpOnly cookies, revoke all sessions (see `docs/spec/09-security-privacy.md`).
- Review P-10: password reset needs email, which arrives only in R1 → R0 cannot offer email + password safely.
- Review A-02: Better Auth generates text ids while the domain uses `@db.Uuid` → FKs would not match.
- Review §5: Better Auth integrates with NestJS only via the community package `@thallesp/nestjs-better-auth` (global guard, Nest body parser disabled).
- Review S-07: Google account linking is an account-takeover vector if email ownership is not verified.

## Decision
Use **Better Auth** as the auth library, integrated through **`@thallesp/nestjs-better-auth`**.
- **R0: Google OAuth only.** Email + password, email verification and password reset arrive in R1 together with the email provider.
- **Ids:** Better Auth `generateId` returns **UUID v7**, the same as domain tables (ADR 012), so auth tables join domain tables with `uuid` FKs.
- **Account linking:** a Google account is linked to an existing user only when the email is verified on **both** sides (`email_verified` from Google and a verified local email); otherwise linking is refused.
- Sessions: HttpOnly cookies; cookie/CSRF/domain rules in ADR 008.
- Registration in R0 restricted by an allowlist (review S-06).
- Fallback if the community package proves unsuitable: mount the Better Auth handler at the Express level (`docs/spec/04-architecture.md` §7).

## Alternatives considered
- Passport + custom session handling — more code in a security-critical area.
- Auth.js — oriented to Next.js; weaker fit for NestJS + SPA.
- Hosted IdP (Auth0, Clerk, Supabase Auth) — vendor lock-in, cost, user data outside our DB; less to show in a portfolio.
- Email + password in R0 — no reset without email; review P-10.

## Consequences
- Positive: proven library, sessions in our own Postgres, uniform UUID v7 ids, smaller R0.
- Negative / trade-offs: dependency on a community Nest adapter; body-parser configuration must be handled globally; R0 users need a Google account.
- Follow-ups: session TTLs (idle/absolute), rotation, re-auth ≤10 min for delete/export, revoke on password change (review S-05); password policy ≥12 chars + HIBP and enumeration-safe responses for R1 (S-06); `user.role` for admin access (S-19); verify adapter compatibility at scaffolding.
