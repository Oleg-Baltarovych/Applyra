# 008. Session cookies, CSRF and domain topology

- Status: Accepted
- Date: 2026-11-16

## Context
- Sessions are cookie-based (ADR 007) with `SameSite=Lax` and CSRF protection for mutations.
- Review S-04: `SameSite=Lax` protects only same-site requests; hosting the SPA on Cloudflare Pages (`*.pages.dev`) and the API on another domain would break cookies and CSRF assumptions.
- Review S-11: no CSP or security headers were defined for the SPA.
- See `docs/spec/09-security-privacy.md` and `docs/spec/12-infra-ops.md`.

## Decision
SPA and API are served from **two subdomains of one registrable domain**: `app.<domain>` (SPA) and `api.<domain>` (API) — same-site.
- Cookies: `__Host-` prefix (Secure, `Path=/`, no `Domain` attribute → bound to `api.<domain>`), HttpOnly, `SameSite=Lax`.
- CSRF: Better Auth `Origin` check on `/api/auth/*` plus an `OriginGuard` on all other mutations; only `https://app.<domain>` (and local dev origins) accepted, otherwise `403 CSRF_ORIGIN`.
- CORS: explicit allowlist (`app.<domain>` per environment), `credentials: true`; no wildcard.
- Mutations never use GET.
- Security headers on the SPA and API: strict CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`, verified by a test in CI (S-11).
- Each environment (staging, production) has its own `app.`/`api.` pair; staging uses a separate registrable domain.
- SPA hosting: **Cloudflare Pages with the custom domain `app.<domain>`** — same registrable domain as `api.<domain>`, therefore same-site (`*.pages.dev` is never used by the app). Fallback: SPA served as static files by Caddy on the VPS with identical headers.

## Alternatives considered
- SPA and API on unrelated domains — cross-site; would need `SameSite=None` and stronger CSRF tokens; third-party cookie restrictions.
- Same origin with a reverse proxy under `/api` — also valid (offered in S-04); not chosen to keep SPA and API independently deployable while staying same-site.
- Double-submit CSRF token — additional moving parts; the Origin check plus SameSite=Lax is sufficient for same-site topology.
- Bearer tokens in localStorage — exposed to XSS.

## Consequences
- Positive: cookies work without `SameSite=None`; CSRF defence is simple and testable; clear CORS surface.
- Negative / trade-offs: requires owning a domain with DNS control; frontend hosting must support a custom `app.` subdomain.
- Follow-ups: local-dev origin list. Resolved: SPA on Cloudflare Pages custom domain (above, ADR 011); CSP directives in `docs/spec/09-security-privacy.md` §9 (`style-src 'self' 'unsafe-inline'` accepted, scripts strict).
