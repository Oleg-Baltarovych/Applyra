# 009. URL capture SSRF policy

- Status: Accepted
- Amended: 2026-11-16 — transport (API → `capture` queue → worker → safe-fetcher) recorded in ADR 021
- Date: 2026-11-16

## Context
- URL capture fetches a user-supplied URL server-side to read `schema.org/JobPosting` JSON-LD — the riskiest endpoint (see `docs/spec/09-security-privacy.md`).
- Review S-01/S-02: validating DNS and then connecting resolves twice (DNS rebinding); the blocklist missed `::ffff:` mapped IPv4, `0.0.0.0/8`, `100.64.0.0/10`, NAT64, decimal/octal IP literals and Docker Compose service names.
- Review S-03: redirects could downgrade https→http or change port; the size limit ignored decompression.
- Review §3 / decision §4.1: the URL fetcher moved out of the cut R0 → **ships in R1**. R0 capture is a manual form with pasted text.

## Decision
A dedicated safe fetcher with an **allow-only** address policy and connection to the already validated IP.
- Schemes `http`/`https` only; ports 80/443 only, checked on **every** redirect hop; at most 3 redirects; https→http downgrade forbidden.
- Hostname resolved once per hop; the address is checked with `ipaddr.js` and must be **public unicast** (range `unicast`); everything else rejected (private, loopback, link-local, metadata `169.254.169.254`, ULA, CGNAT, `0.0.0.0/8`, NAT64, IPv4-mapped IPv6).
- The socket connects to the **validated IP** via a custom `lookup` in undici (no second resolution).
- IP literals in non-canonical forms (decimal, octal, hex) are normalised before checking or rejected.
- Fetch runs on an **isolated egress network** that cannot reach Compose services (postgres, redis, minio).
- Timeout 5 s; max 2 MB **after decompression**; `text/html` only; no cookies, no auth headers; identifiable User-Agent.
- Rate limit per user (e.g. 30/hour); disabled for demo users (ADR 014).
- 403 / CAPTCHA / login wall → "Paste the job text instead", no retries.
- Per-domain policy (review P-18): LinkedIn paste-only; other sites per robots/ToS.

## Alternatives considered
- Blocklist of private ranges — incomplete by construction (S-02).
- Validate-then-fetch with the default resolver — DNS rebinding.
- Third-party fetch/scraping service — cost, sends user activity to a vendor.
- Client-side fetch (browser) — blocked by CORS on job sites.

## Consequences
- Positive: SSRF closed at the network and application layer; policy is unit-testable.
- Negative / trade-offs: some legitimate pages fail (size, redirects, bot protection); extra network config in Compose.
- Follow-ups: SSRF negative test fixtures (review T-03); concrete domain policy list after checking 10 real URLs per site (P-11); exact rate-limit values.
