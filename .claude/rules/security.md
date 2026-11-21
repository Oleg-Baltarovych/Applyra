---
paths:
  - "apps/digest/src/**"
  - ".github/workflows/**"
---
# Security rules

- Secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, future LLM keys) come only from env / GitHub secrets. Never log them, put them in error messages (the bot token is part of the Bot API URL), state files, fixtures or the profile.
- Sources: public RSS/feeds/APIs only. No scraping that bypasses ToS, robots rules, auth or CAPTCHA; no logged-in sessions; one request per feed per run, timeout on every fetch, identify with a generic User-Agent.
- Feed content is untrusted: escape every field before Telegram HTML (`format.ts`), link only http(s) urls, bound field sizes; never execute or `eval` feed data.
- Workflows: `permissions: contents: read`, actions pinned by SHA + version comment, secrets only in `env:` of the step that needs them, never `${{ }}` of untrusted input inside `run:`, no `pull_request_target`.
- No personal data in the repo (profile.json holds preferences only: no name, phone, email, links).
