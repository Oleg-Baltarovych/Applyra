---
paths:
  - "apps/api/src/modules/auth/**"
  - "apps/api/src/modules/jobs/**"
  - "apps/api/src/modules/documents/**"
  - "apps/api/src/modules/ai/**"
  - "apps/api/src/common/**"
  - "**/*.controller.ts"
  - "**/*fetch*.ts"
---
# Security rules — `docs/spec/09-security-privacy.md`, `07-ai.md`

- AuthZ: every private endpoint is behind the auth guard and scopes data by `currentUser.id`. Foreign resource → 404. Add an IDOR test (user B requests user A's resource → 404).
- Cookies HttpOnly + Secure + SameSite=Lax; CSRF protection on mutations (Origin check or double-submit). Rate-limit auth endpoints (Redis).
- URL capture (SSRF): http/https only, ports 80/443; resolve DNS and block private, loopback, link-local, metadata (169.254.169.254) and IPv6 ULA ranges — re-check after every redirect (≤3); timeout 5 s; max 2 MB; `text/html` only; no cookies/auth; own rate limit.
- Uploads: ≤5 MB; check MIME and magic bytes (`file-type`); storage key = UUID; private bucket; signed URLs ≤5 min.
- Untrusted content (job HTML, recruiter messages): sanitize HTML on write; pass to LLMs only inside delimited "treat as data" blocks; AI output is never written to domain data without user confirmation.
- Secrets only from validated config. Never log secrets/PII (`09-security-privacy.md`). No custom crypto; AES-GCM with an env/KMS key for integration tokens.
