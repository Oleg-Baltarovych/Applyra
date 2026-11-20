# 028. Status buttons in Telegram via a Cloudflare Worker

- Status: Accepted
- Date: 2026-11-20
- Amends: ADR 026 (non-goals "no hosting, no database, no application tracking")

## Context

The owner wants to mark, right in Telegram, which vacancies they applied to, which are in progress, which
rejected them, and to see that list at any time. Inline buttons are the clearest UI, but a button press is an
update Telegram delivers to the bot **at the moment of the press**: the daily digest (a one-minute cron job) is not
running then. Telegram reactions need nothing new but give no list and a weaker UI; an hourly GitHub Actions poller
delays every press by up to an hour and eats ~720 of the 2,000 free minutes a month.

## Decision

- The digest sends a short header and then **one message per vacancy** with four buttons:
  ✅ Відгукнувся · 🔄 В процесі · ❌ Відмова · 🚫 Не цікаво. Callback data `s:<code>:<vacancy id>` (≤ 64 bytes),
  protocol in `apps/digest/src/status.ts`, shared with the worker.
- A **Cloudflare Worker** (`apps/bot`, free plan) is the bot's webhook. A press stores the status in **Cloudflare
  D1** (one table `statuses`; title, second line and link copied from the message) and redraws the keyboard with a
  status row on top (`Статус: 🔄 В процесі · 20.11`); pressing the current status clears it. `/status` lists all
  marked vacancies grouped by status, with links; "not interested" only as a count.
- Only the owner's chat is served (`OWNER_CHAT_ID`); every request must carry the webhook secret
  (`X-Telegram-Bot-Api-Secret-Token`, compared in constant time); updates are parsed defensively, links kept only if
  http(s), output HTML-escaped. Secrets live only as Worker secrets (`wrangler secret put`, set by
  `scripts/setup.ts` from the local env file via stdin, never printed).
- The digest itself is unchanged in shape: still a cron job with its own sent-ids state; the two parts share only
  the callback protocol. Deploys are manual (`wrangler deploy`), not from CI, so no Cloudflare token is stored in
  GitHub.
- Dev dependency `wrangler` (Cloudflare's official deploy/D1 CLI; pulls `workerd`, whose postinstall is allowed).
  No `@cloudflare/workers-types`: the worker declares the few D1/Request types it uses.

## Consequences

- "No hosting, no database" no longer holds literally: one free serverless Worker + one D1 table. Still no server to
  run or pay for. Free-plan limits (100k requests/day, D1 5 GB) are far above one user's presses.
- Lightweight status marking is in scope; a full CRM (notes, reminders, pipelines, multi-user) is still a non-goal.
- The digest sends up to ~21 messages per run, spaced ≥ 1.1 s (Telegram's per-chat rate).
- If the Worker is down, presses fail visibly (spinner) and the digest is unaffected.

## Alternatives considered

- Telegram reactions as statuses — no infrastructure, but no list and a less clear UI.
- Hourly GitHub Actions `getUpdates` poller — up to an hour of lag per press, a large share of the free minutes.
- Always-on VPS / long-polling bot — hosting cost and upkeep for one user.
