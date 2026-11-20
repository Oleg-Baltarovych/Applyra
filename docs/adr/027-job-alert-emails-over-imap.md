# 027. Job-alert e-mails over IMAP for sites without a public feed

- Status: Accepted
- Date: 2026-11-20

## Context

Work.ua and robota.ua carry many relevant vacancies, LinkedIn too, but none offers a feed the digest may use:
their robots rules, anti-bot measures and a Cloudflare challenge rule out direct fetching (spec §2: public feeds
only, no ToS/robots/CAPTCHA bypass, no logged-in sessions). All three do send **job-alert e-mails** to a subscriber.
ADR 026 rejected per-site alert mails *as the product*; as an *input* they are fine — the digest still ranks and
dedups everything in one place.

## Decision

- New source `email`: a dedicated mailbox (Gmail + App Password) subscribed to the sites' alerts. Each run reads
  `INBOX` over IMAP/TLS **read-only** (nothing is marked, moved or deleted), mails of the last 3 days (≤ 100, html
  part ≤ 1 MB); dedup state drops repeats, so re-reading is harmless and runs stay idempotent.
- **Authenticity:** a mail is parsed only when its From domain is the site's and the topmost `Authentication-Results`
  header was written by the expected receiving server (authserv-id, default `mx.google.com`, env `IMAP_AUTHSERV_ID`)
  and shows `dkim=pass` for the site's domain in its **leading run of strictly formed dkim clauses** (plain
  `header.x=value` tokens). Later clauses (arc, spf, dmarc) reflect sender-controlled text the server does not escape
  reliably, so they are never read; DKIM values cannot contain `;` — a forged From alone could
  inject titles. If a site signs with another domain its alerts are skipped (visible as no items from it).
- Parsing is **template-agnostic**: at most 100 vacancies per mail; every link whose (url-decoded) target is a
  vacancy page becomes one item, titled by its first descriptive link text; the url is rebuilt from the id, so
  tracking parameters and redirects vanish. Linear scanning, no backtracking regex over mail html.
- Dependency **`imapflow`** (MIT, maintained, typed): IMAP over TLS plus MIME/transfer-encoding/charset decoding of the
  html part — too protocol-heavy and security-relevant to hand-roll. Its logger is off; errors are reduced to a stage
  plus error class/code (never server text or credentials). No `mailparser`: `imapflow` decodes text parts itself.
- Secrets `IMAP_USER`, `IMAP_PASSWORD` in the `digest` environment, passed only to the run step.

## Consequences

- Work.ua / robota.ua / LinkedIn vacancies arrive with a title and link only (no description, company or salary in
  most alerts), so they rank lower or carry "level/remote unclear" caveats; source-side alert filters matter.
- The parser is written against synthetic layouts; it must be checked against real alert mails once the mailbox
  exists (fixtures then trimmed and anonymised).
- One more runtime dependency (+ its transitive deps such as `pino`, `iconv-lite`) under the existing supply-chain
  gates (pnpm audit, osv-scanner, 24 h minimum release age).

## Alternatives considered

- Scraping the sites' search pages — violates robots rules / anti-bot protections (spec §2).
- Unofficial APIs or a logged-in session — against the rules, brittle.
- Gmail API with OAuth — a refresh token and a Google Cloud project for one read-only inbox; IMAP + App Password is
  simpler and provider-agnostic.
- Hand-written IMAP client — fewer deps, but MIME/charset handling is where bugs and security issues live.
